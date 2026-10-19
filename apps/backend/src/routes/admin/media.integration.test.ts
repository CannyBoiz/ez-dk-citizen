import assert from "node:assert/strict";
import { test } from "node:test";
import { mediaAssetSchema } from "@ez-dk-citizen/data";

import { code, useBackend } from "../../testing/backend.js";

const {
  data,
  storage,
  request,
  read,
  inStorage,
  createLesson,
  requestUpload,
  complete,
  upload,
} = useBackend();
// No Admin API route answers a Media Asset's status.
const mediaAsset = async (id: number) =>
  mediaAssetSchema.parse(await data.getMediaAsset(id));
const lessonWithTexts = async (chapter: number, languageCodes = ["th"]) => {
  const lesson = await createLesson(chapter);
  for (const languageCode of languageCodes) {
    await request(`/lessons/${lesson.id}/texts/${languageCode}`, "PUT", {
      title: "Title",
      content: "Content",
    });
  }
  return read(lesson.id);
};
const publish = async (id: number, url: string) => {
  const source = await (
    await request("/sources", "POST", { url, publishedAt: null })
  ).json();
  await request(`/lessons/${id}/sources/${source.id}`, "PUT", {});
  const published = await request(`/lessons/${id}`, "PATCH", {
    status: "PUBLISHED",
    changeKind: "fix",
  });
  assert.equal(published.status, 200);
  return published.json();
};

test("an Upload Intent validates the Language and leaves an unbound pending Media Asset", async () => {
  const lesson = await lessonWithTexts(70);
  const intent = (languageCode: string) =>
    request("/media/upload-intents", "POST", {
      lessonId: lesson.id,
      languageCode,
      originalFilename: "lesson.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 50 * 1024 * 1024,
    });

  const unsupported = await intent("zz");
  assert.equal(unsupported.status, 422);
  assert.equal(await code(unsupported), "unsupported_language");
  assert.equal(storage.uploads.length, 0);

  const created = await intent("th");
  assert.equal(created.status, 201);
  const { mediaAssetId } = await created.json();
  const asset = await mediaAsset(mediaAssetId);
  assert.deepEqual(
    {
      storageContainer: asset.storageContainer,
      objectKey: asset.objectKey,
      status: asset.status,
      sizeBytes: asset.sizeBytes,
      durationMs: asset.durationMs,
      uploadedAt: asset.uploadedAt,
    },
    {
      storageContainer: "citizenship-audio",
      objectKey: storage.uploads[0]?.key,
      status: "PENDING",
      sizeBytes: 50 * 1024 * 1024,
      durationMs: null,
      uploadedAt: null,
    },
  );
  assert.deepEqual(
    await (await request(`/lessons/${lesson.id}/audio/th`)).json(),
    { audio: null },
  );
});

test("completion waits for the stored object, then makes the first Lesson Audio current", async (context) => {
  const lesson = await lessonWithTexts(70);
  const { id, objectKey } = await requestUpload(lesson.id, "th");

  const missing = await complete(id, lesson.id, "th");
  assert.equal(missing.status, 409);
  assert.equal(await code(missing), "upload_incomplete");
  assert.equal((await mediaAsset(id)).status, "PENDING");

  storage.putObject(objectKey, { contentType: "audio/mpeg", sizeBytes: 1 });
  const outage = context.mock.method(storage, "inspectObject", async () => {
    throw Object.assign(new Error("temporary storage failure"), {
      name: "SlowDown",
    });
  });
  const transient = await complete(id, lesson.id, "th");
  assert.equal(transient.status, 503);
  assert.equal(await code(transient), "storage_unavailable");
  assert.equal((await mediaAsset(id)).status, "PENDING");
  outage.mock.restore();

  const completed = await complete(id, lesson.id, "th");
  assert.equal(completed.status, 200);
  const result = await completed.json();
  assert.deepEqual(Object.keys(result.mediaAsset).sort(), [
    "contentType",
    "durationMs",
    "id",
    "sizeBytes",
    "status",
    "uploadedAt",
  ]);
  assert.equal(result.mediaAsset.id, id);
  assert.equal(result.mediaAsset.status, "READY");
  assert.ok(result.mediaAsset.uploadedAt);
  assert.deepEqual(result.lessonAudio, {
    id: result.lessonAudio.id,
    lessonId: lesson.id,
    languageCode: "th",
    audioVersion: 1,
    isCurrent: true,
    createdAt: result.lessonAudio.createdAt,
  });
  assert.equal((await mediaAsset(id)).status, "READY");
  assert.ok(
    Date.parse((await read(lesson.id)).updatedAt) >
      Date.parse(lesson.updatedAt),
  );
  const current = await (
    await request(`/lessons/${lesson.id}/audio/th`)
  ).json();
  assert.equal(current.audio.mediaAssetId, id);
  assert.equal(current.audio.audioVersion, 1);
});

test("a size or content-type mismatch fails the Media Asset for good and deletes its object", async () => {
  const lesson = await lessonWithTexts(71);
  for (const object of [
    { contentType: "audio/mpeg", sizeBytes: 2 },
    { contentType: "audio/ogg", sizeBytes: 1 },
  ]) {
    const { id, objectKey } = await requestUpload(lesson.id, "th");
    storage.putObject(objectKey, object);

    const invalid = await complete(id, lesson.id, "th");
    assert.equal(invalid.status, 422);
    assert.equal(await code(invalid), "invalid_uploaded_media");
    assert.equal((await mediaAsset(id)).status, "FAILED");
    assert.equal(await inStorage(objectKey), false);

    // Even a matching object cannot revive it.
    storage.putObject(objectKey, { contentType: "audio/mpeg", sizeBytes: 1 });
    const retry = await complete(id, lesson.id, "th");
    assert.equal(retry.status, 409);
    assert.equal(await code(retry), "media_asset_failed");
  }
  assert.deepEqual(
    await (await request(`/lessons/${lesson.id}/audio/th`)).json(),
    { audio: null },
  );
});

test("completion promotes corrections, answers retries with the original result, and refuses rebinding and Archived Lessons", async () => {
  const lesson = await lessonWithTexts(71, ["th", "da"]);

  const first = await upload(lesson.id, "th");
  assert.equal(first.completion.lessonAudio.audioVersion, 1);
  const firstRetry = await complete(first.id, lesson.id, "th");
  assert.equal(firstRetry.status, 200);
  assert.deepEqual(await firstRetry.json(), first.completion);

  const published = await publish(lesson.id, "https://example.com/corrections");
  const second = await upload(lesson.id, "th");
  assert.equal(second.completion.lessonAudio.audioVersion, 2);
  assert.equal(second.completion.lessonAudio.isCurrent, true);
  const corrected = await read(lesson.id);
  assert.ok(Date.parse(corrected.updatedAt) > Date.parse(published.updatedAt));

  const secondRetry = await complete(second.id, lesson.id, "th");
  assert.equal(secondRetry.status, 200);
  assert.deepEqual(await secondRetry.json(), second.completion);
  assert.equal((await read(lesson.id)).updatedAt, corrected.updatedAt);

  const supersededRetry = await complete(first.id, lesson.id, "th");
  assert.equal(supersededRetry.status, 200);
  assert.deepEqual(await supersededRetry.json(), {
    ...first.completion,
    lessonAudio: { ...first.completion.lessonAudio, isCurrent: false },
  });
  const current = await (
    await request(`/lessons/${lesson.id}/audio/th`)
  ).json();
  assert.equal(current.audio.mediaAssetId, second.id);
  assert.equal(current.audio.audioVersion, 2);

  const rebind = await complete(first.id, lesson.id, "da");
  assert.equal(rebind.status, 409);
  assert.equal(await code(rebind), "media_asset_rebind_conflict");

  const archived = await lessonWithTexts(73);
  await publish(archived.id, "https://example.com/archived");
  const archive = await request(`/lessons/${archived.id}`, "PATCH", {
    status: "ARCHIVED",
  });
  assert.equal(archive.status, 200);
  const late = await requestUpload(archived.id, "th");
  storage.putObject(late.objectKey, {
    contentType: "audio/mpeg",
    sizeBytes: 1,
  });
  const refused = await complete(late.id, archived.id, "th");
  assert.equal(refused.status, 409);
  assert.equal(await code(refused), "lesson_archived");
});

test("concurrent completions for one Lesson Text get consecutive versions and one current rendition", async () => {
  const lesson = await lessonWithTexts(74);
  const assets = [
    await requestUpload(lesson.id, "th"),
    await requestUpload(lesson.id, "th"),
  ];
  for (const { objectKey } of assets) {
    storage.putObject(objectKey, { contentType: "audio/mpeg", sizeBytes: 1 });
  }

  const completions = await Promise.all(
    assets.map(async ({ id }) => {
      const response = await complete(id, lesson.id, "th");
      assert.equal(response.status, 200);
      return response.json();
    }),
  );

  assert.deepEqual(
    completions.map(({ lessonAudio }) => lessonAudio.audioVersion).sort(),
    [1, 2],
  );
  const latest = completions.find(
    ({ lessonAudio }) => lessonAudio.audioVersion === 2,
  );
  const current = await (
    await request(`/lessons/${lesson.id}/audio/th`)
  ).json();
  assert.equal(current.audio.mediaAssetId, latest.mediaAsset.id);
  assert.equal(current.audio.audioVersion, 2);
});

test("current Lesson Audio serves the current rendition with a fresh Playback URL in every Lesson status", async () => {
  const lesson = await lessonWithTexts(76, ["th", "da"]);
  const readAudio = (languageCode: string, id = lesson.id) =>
    request(`/lessons/${id}/audio/${languageCode}`);
  const expectAudio = async (expected: object) => {
    const signed = storage.playbackAuthorizations.length;
    const response = await readAudio("th");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const { audio } = await response.json();
    const { playbackExpiresAt, ...rest } = audio;
    assert.deepEqual(rest, expected);
    assert.ok(Date.parse(playbackExpiresAt) > Date.now());
    assert.equal(storage.playbackAuthorizations.length, signed + 1);
  };

  const none = await readAudio("th");
  assert.equal(none.status, 200);
  assert.deepEqual(await none.json(), { audio: null });
  assert.deepEqual(await (await readAudio("en")).json(), { audio: null });
  const unsupported = await readAudio("zz");
  assert.equal(unsupported.status, 422);
  assert.equal(await code(unsupported), "unsupported_language");
  const missing = await readAudio("th", 987654);
  assert.equal(missing.status, 404);
  assert.equal(await code(missing), "lesson_not_found");

  const first = await upload(lesson.id, "th", "first.mp3");
  await expectAudio({
    mediaAssetId: first.id,
    audioVersion: 1,
    originalFilename: "first.mp3",
    contentType: "audio/mpeg",
    sizeBytes: 1,
    durationMs: null,
    playbackUrl: `https://storage.invalid/${first.objectKey}?playback=1`,
  });

  const second = await upload(lesson.id, "th", "second.mp3");
  const current = {
    mediaAssetId: second.id,
    audioVersion: 2,
    originalFilename: "second.mp3",
    contentType: "audio/mpeg",
    sizeBytes: 1,
    durationMs: null,
    playbackUrl: `https://storage.invalid/${second.objectKey}?playback=1`,
  };
  await expectAudio(current);
  assert.deepEqual(await (await readAudio("da")).json(), { audio: null });

  await publish(lesson.id, "https://example.com/admin-current-audio");
  await expectAudio(current);
  const archive = await request(`/lessons/${lesson.id}`, "PATCH", {
    status: "ARCHIVED",
  });
  assert.equal(archive.status, 200);
  await expectAudio(current);
});

test("completion stays idempotent for a Media Asset a new version shares, and new uploads stay in their own Lesson", async () => {
  const original = await lessonWithTexts(77, ["th", "da"]);
  const first = await upload(original.id, "th");
  await publish(original.id, "https://example.com/shared-completion");
  const copied = await request("/lessons", "POST", {
    copyFromLessonId: original.id,
  });
  assert.equal(copied.status, 201);
  const copy = await copied.json();
  const other = await lessonWithTexts(78);
  const currentAudio = async (lessonId: number) =>
    (await (await request(`/lessons/${lessonId}/audio/th`)).json()).audio;

  // A retry for the original upload still answers the original Lesson Audio.
  const retry = await complete(first.id, original.id, "th");
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), first.completion);

  // The copy's Lesson Audio for that Media Asset answers for the copy, and no other is made.
  const copyRetry = await complete(first.id, copy.id, "th");
  assert.equal(copyRetry.status, 200);
  const { mediaAsset: completed, lessonAudio } = await copyRetry.json();
  assert.deepEqual(completed, first.completion.mediaAsset);
  assert.notEqual(lessonAudio.id, first.completion.lessonAudio.id);
  assert.equal(lessonAudio.lessonId, copy.id);
  assert.equal(lessonAudio.languageCode, "th");
  assert.equal(lessonAudio.audioVersion, 1);
  assert.equal(lessonAudio.isCurrent, true);

  // A Lesson and Language with no Lesson Audio for it is a rebind, even beside a shared one.
  for (const [lessonId, languageCode] of [
    [copy.id, "da"],
    [original.id, "da"],
    [other.id, "th"],
  ] as const) {
    const rebind = await complete(first.id, lessonId, languageCode);
    assert.equal(rebind.status, 409, `${lessonId}:${languageCode}`);
    assert.equal(await code(rebind), "media_asset_rebind_conflict");
  }
  assert.equal(await currentAudio(other.id), null);

  // A new upload on the copy follows its one copied version, and the original keeps its audio.
  const correction = await upload(copy.id, "th");
  assert.equal(correction.completion.lessonAudio.audioVersion, 2);
  assert.equal(correction.completion.lessonAudio.lessonId, copy.id);
  assert.equal((await currentAudio(copy.id)).mediaAssetId, correction.id);
  const originalAudio = await currentAudio(original.id);
  assert.equal(originalAudio.mediaAssetId, first.id);
  assert.equal(originalAudio.audioVersion, 1);
  assert.equal((await mediaAsset(first.id)).status, "READY");
});
