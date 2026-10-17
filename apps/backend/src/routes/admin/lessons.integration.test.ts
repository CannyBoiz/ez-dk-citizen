import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  completeMediaAssetResponseSchema,
  currentLessonAudioResponseSchema,
  mediaAssetResponseSchema,
  type ProblemDetails,
} from "@ez-dk-citizen/api-contracts";
import { createDataModule } from "@ez-dk-citizen/data";
import { resetDatabaseBetweenTests } from "@ez-dk-citizen/data/testing";

import { createBackendApp } from "../../app.js";
import { FakeStorage } from "../../storage.js";

resetDatabaseBetweenTests();
const data = createDataModule(String(process.env.DATABASE_URL), 2_000);
after(() => data.close());
const storage = new FakeStorage();
const app = createBackendApp(async () => undefined, {
  adminApiToken: "admin-token",
  data,
  storage,
});
const headers = {
  Authorization: "Bearer admin-token",
  "Content-Type": "application/json",
};
const request = (path: string, method = "GET", body?: unknown) =>
  app.request(`/api/admin${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const read = async (id: number) => (await request(`/lessons/${id}`)).json();
const createLesson = async (chapter: number) => {
  const response = await request("/lessons", "POST", { chapter });
  assert.equal(response.status, 201);
  return response.json();
};
const createSource = async (url: string) =>
  (await request("/sources", "POST", { url, publishedAt: null })).json();
const code = async (response: Response) =>
  ((await response.json()) as ProblemDetails).code;

test("Admin API Lesson operations persist and return aggregate transport shapes", async () => {
  const unauthorized = await app.request("/api/admin/lessons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapter: 1 }),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal((await app.request("/api/admin/lessons/1")).status, 401);

  assert.equal(
    (await request("/lessons", "POST", { chapter: 1, status: "PUBLISHED" }))
      .status,
    422,
  );
  assert.equal(
    (await request("/lessons", "POST", { chapter: 1, version: 1 })).status,
    422,
  );

  const valid = await request("/lessons", "POST", { chapter: 1 });
  assert.equal(valid.status, 201);
  const detail = await valid.json();
  assert.equal(
    valid.headers.get("location"),
    `/api/admin/lessons/${detail.id}`,
  );
  assert.equal(detail.status, "DRAFT");
  assert.equal(detail.chapter, 1);
  assert.equal(detail.version, null);
  assert.equal(detail.versionPatch, null);
  assert.deepEqual(detail.availableLanguageCodes, []);
  assert.deepEqual(detail.lessonTexts, []);
  assert.deepEqual(detail.lessonSources, []);

  const text = await request(`/lessons/${detail.id}/texts/th`, "PUT", {
    title: "บท",
    content: "เนื้อหา",
  });
  assert.equal(text.status, 200);
  const localized = await text.json();
  assert.deepEqual(localized.availableLanguageCodes, ["th"]);
  assert.deepEqual(localized.lessonTexts, [
    { languageCode: "th", title: "บท", content: "เนื้อหา" },
  ]);
  assert.notEqual(localized.updatedAt, detail.updatedAt);

  const replacement = await request(`/lessons/${detail.id}/texts/th`, "PUT", {
    title: "แทนที่",
    content: "เนื้อหาใหม่",
  });
  assert.equal(replacement.status, 200);
  assert.deepEqual((await replacement.json()).lessonTexts, [
    { languageCode: "th", title: "แทนที่", content: "เนื้อหาใหม่" },
  ]);

  const unsupported = await request(`/lessons/${detail.id}/texts/xx`, "PUT", {
    title: "Title",
    content: "Content",
  });
  assert.equal(unsupported.status, 422);
  assert.equal(await code(unsupported), "unsupported_language");

  const missingTextLesson = await request("/lessons/999999/texts/th", "PUT", {
    title: "Title",
    content: "Content",
  });
  assert.equal(missingTextLesson.status, 404);
  assert.equal(await code(missingTextLesson), "lesson_not_found");

  const secondDraft = await createLesson(1);

  const list = await request("/lessons");
  assert.equal(list.status, 200);
  // Drafts have no version to order by, so the newest comes first.
  assert.deepEqual(
    (await list.json()).items.map((item: { id: number }) => item.id),
    [secondDraft.id, detail.id],
  );

  const inspected = await request(`/lessons/${detail.id}`);
  assert.equal(inspected.status, 200);
  assert.equal((await inspected.json()).id, detail.id);

  const missing = await request("/lessons/999999");
  assert.equal(missing.status, 404);
  assert.equal(await code(missing), "lesson_not_found");
});

test("Admin API Lesson Sources replace locators and detach safely", async () => {
  const lesson = await createLesson(2);
  const firstSource = await createSource("https://example.com/first");
  const secondSource = await createSource("https://example.com/second");
  const cite = (lessonId: number, sourceId: number, body: unknown = {}) =>
    request(`/lessons/${lessonId}/sources/${sourceId}`, "PUT", body);
  const detach = (lessonId: number, sourceId: number) =>
    request(`/lessons/${lessonId}/sources/${sourceId}`, "DELETE");

  const invalid = await cite(lesson.id, firstSource.id, {
    pageFrom: 2,
    pageTo: 1,
  });
  assert.equal(invalid.status, 422);

  const attached = await cite(lesson.id, firstSource.id, {
    pageFrom: 2,
    pageTo: 3,
    sectionReference: "section 1",
  });
  assert.equal(attached.status, 200);
  const attachedDetail = await attached.json();
  assert.deepEqual(attachedDetail.lessonSources, [
    {
      id: firstSource.id,
      url: firstSource.url,
      publishedAt: null,
      pageFrom: 2,
      pageTo: 3,
      sectionReference: "section 1",
    },
  ]);
  assert.notEqual(attachedDetail.updatedAt, lesson.updatedAt);

  const replaced = await cite(lesson.id, firstSource.id);
  assert.equal(replaced.status, 200);
  const replacedDetail = await replaced.json();
  assert.deepEqual(replacedDetail.lessonSources[0], {
    id: firstSource.id,
    url: firstSource.url,
    publishedAt: null,
    pageFrom: null,
    pageTo: null,
    sectionReference: null,
  });
  assert.notEqual(replacedDetail.updatedAt, attachedDetail.updatedAt);

  const secondAttachment = await cite(lesson.id, secondSource.id);
  assert.equal(secondAttachment.status, 200);
  const withTwoSources = await secondAttachment.json();
  assert.deepEqual(
    withTwoSources.lessonSources.map((item: { id: number }) => item.id),
    [firstSource.id, secondSource.id],
  );

  const missingSource = await cite(lesson.id, 999_999);
  assert.equal(missingSource.status, 404);
  assert.equal(await code(missingSource), "source_not_found");
  const missingLesson = await cite(999_999, firstSource.id);
  assert.equal(missingLesson.status, 404);
  assert.equal(await code(missingLesson), "lesson_not_found");

  const secondLesson = await createLesson(2);
  const reused = await cite(secondLesson.id, firstSource.id);
  assert.equal(reused.status, 200);
  assert.equal((await reused.json()).lessonSources[0].id, firstSource.id);

  await request(`/lessons/${secondLesson.id}/texts/th`, "PUT", {
    title: "บท",
    content: "เนื้อหา",
  });
  assert.equal(
    (
      await request(`/lessons/${secondLesson.id}`, "PATCH", {
        status: "PUBLISHED",
      })
    ).status,
    200,
  );
  const blocked = await cite(secondLesson.id, secondSource.id);
  assert.equal(blocked.status, 409);
  assert.equal(await code(blocked), "lesson_not_editable");

  const detached = await detach(lesson.id, firstSource.id);
  assert.equal(detached.status, 204);
  const detachedDetail = await read(lesson.id);
  assert.deepEqual(
    detachedDetail.lessonSources.map((item: { id: number }) => item.id),
    [secondSource.id],
  );
  assert.notEqual(detachedDetail.updatedAt, withTwoSources.updatedAt);

  const repeatedDetach = await detach(lesson.id, firstSource.id);
  assert.equal(repeatedDetach.status, 204);
  assert.equal((await read(lesson.id)).updatedAt, detachedDetail.updatedAt);
});

test("Admin API Lesson patches enforce lifecycle and immutable history", async () => {
  const patchLesson = (id: number, body: unknown) =>
    request(`/lessons/${id}`, "PATCH", body);

  const draft = await createLesson(10);
  const structured = await patchLesson(draft.id, { chapter: 11 });
  assert.equal(structured.status, 200);
  const structuredDetail = await structured.json();
  assert.equal(structuredDetail.chapter, 11);
  assert.equal(structuredDetail.version, null);
  assert.notEqual(structuredDetail.updatedAt, draft.updatedAt);
  assert.equal((await patchLesson(draft.id, { version: 2 })).status, 422);

  const repeatedDraft = await patchLesson(draft.id, { status: "DRAFT" });
  assert.equal(repeatedDraft.status, 409);
  assert.equal(await code(repeatedDraft), "lesson_lifecycle_conflict");

  const source = await createSource("https://example.com/immutable");
  assert.equal(
    (await request(`/lessons/${draft.id}/sources/${source.id}`, "PUT", {}))
      .status,
    200,
  );
  const makePublishable = async (id: number) => {
    await request(`/lessons/${id}/texts/th`, "PUT", {
      title: "บท",
      content: "เนื้อหา",
    });
    await request(`/lessons/${id}/sources/${source.id}`, "PUT", {});
  };
  await makePublishable(draft.id);
  const published = await patchLesson(draft.id, {
    chapter: 12,
    status: "PUBLISHED",
  });
  assert.equal(published.status, 200);
  const publishedDetail = await published.json();
  assert.equal(publishedDetail.status, "PUBLISHED");
  assert.equal(publishedDetail.chapter, 12);
  assert.equal(publishedDetail.version, 1);
  assert.equal(publishedDetail.versionPatch, 0);

  // Neither a Published nor an Archived Lesson can be edited.
  const expectNotEditable = async () => {
    for (const response of [
      await request(`/lessons/${draft.id}/texts/th`, "PUT", {
        title: "Titel",
        content: "Indhold",
      }),
      await request(`/lessons/${draft.id}/sources/${source.id}`, "PUT", {
        pageFrom: 2,
      }),
      await request(`/lessons/${draft.id}/sources/${source.id}`, "DELETE"),
      await patchLesson(draft.id, { chapter: 13 }),
    ]) {
      assert.equal(response.status, 409);
      const problem = (await response.json()) as ProblemDetails;
      assert.equal(problem.code, "lesson_not_editable");
      assert.equal(problem.detail, "Only Draft Lessons can be edited.");
    }
  };
  const expectLifecycleConflict = async (
    statuses: Array<"DRAFT" | "PUBLISHED" | "ARCHIVED">,
  ) => {
    for (const status of statuses) {
      const rejected = await patchLesson(draft.id, { status });
      assert.equal(rejected.status, 409, status);
      assert.equal(await code(rejected), "lesson_lifecycle_conflict");
    }
  };
  await expectNotEditable();
  await expectLifecycleConflict(["PUBLISHED", "DRAFT"]);

  const archived = await patchLesson(draft.id, { status: "ARCHIVED" });
  assert.equal(archived.status, 200);
  assert.equal((await archived.json()).status, "ARCHIVED");
  await expectLifecycleConflict(["ARCHIVED", "DRAFT", "PUBLISHED"]);
  await expectNotEditable();

  // A Draft that is no longer wanted is deleted, never archived.
  const draftToArchive = await createLesson(20);
  const directArchive = await patchLesson(draftToArchive.id, {
    status: "ARCHIVED",
  });
  assert.equal(directArchive.status, 409);
  assert.equal(await code(directArchive), "lesson_lifecycle_conflict");
  assert.deepEqual(await read(draftToArchive.id), draftToArchive);

  const publishedVersion = await createLesson(30);
  await makePublishable(publishedVersion.id);
  assert.equal(
    (await patchLesson(publishedVersion.id, { status: "PUBLISHED" })).status,
    200,
  );
  const competing = await createLesson(30);
  await makePublishable(competing.id);
  const beforeCompetingPublish = await read(competing.id);
  const competingPublish = await patchLesson(competing.id, {
    status: "PUBLISHED",
    changeKind: "fix",
  });
  assert.equal(competingPublish.status, 409);
  assert.equal(await code(competingPublish), "published_lesson_conflict");
  assert.deepEqual(await read(competing.id), beforeCompetingPublish);
});

test("Admin API Lesson publication requires a Thai Lesson Text and a Lesson Source", async () => {
  const expectIncomplete = async (
    id: number,
    body: unknown,
    paths: Array<Array<string>>,
  ) => {
    const before = await read(id);
    const response = await request(`/lessons/${id}`, "PATCH", body);
    assert.equal(response.status, 409);
    const details = (await response.json()) as ProblemDetails;
    assert.equal(details.code, "lesson_publication_incomplete");
    assert.deepEqual(
      details.errors?.map((error) => error.path),
      paths,
    );
    assert.deepEqual(await read(id), before);
  };
  const thaiText = ["lessonTexts", "th"];
  const lessonSources = ["lessonSources"];

  const lesson = await createLesson(80);
  await expectIncomplete(lesson.id, { status: "PUBLISHED" }, [
    thaiText,
    lessonSources,
  ]);

  await request(`/lessons/${lesson.id}/texts/th`, "PUT", {
    title: "บท",
    content: "เนื้อหา",
  });
  await expectIncomplete(lesson.id, { status: "PUBLISHED" }, [lessonSources]);
  await expectIncomplete(lesson.id, { chapter: 81, status: "PUBLISHED" }, [
    lessonSources,
  ]);

  const source = await createSource(
    "https://example.com/publication-prerequisites",
  );
  const untranslated = await createLesson(82);
  await request(`/lessons/${untranslated.id}/texts/da`, "PUT", {
    title: "Titel",
    content: "Indhold",
  });
  await request(`/lessons/${untranslated.id}/sources/${source.id}`, "PUT", {});
  await expectIncomplete(untranslated.id, { status: "PUBLISHED" }, [thaiText]);

  await request(`/lessons/${lesson.id}/sources/${source.id}`, "PUT", {});
  const published = await request(`/lessons/${lesson.id}`, "PATCH", {
    chapter: 81,
    status: "PUBLISHED",
  });
  assert.equal(published.status, 200);
  const publishedDetail = await published.json();
  assert.deepEqual(
    {
      chapter: publishedDetail.chapter,
      version: publishedDetail.version,
      versionPatch: publishedDetail.versionPatch,
      status: publishedDetail.status,
      availableLanguageCodes: publishedDetail.availableLanguageCodes,
    },
    {
      chapter: 81,
      version: 1,
      versionPatch: 0,
      status: "PUBLISHED",
      availableLanguageCodes: ["th"],
    },
  );
  // Publication creates no Lesson Audio. Lesson Audio routes still call the Data
  // Service, so the data module reads it.
  assert.deepEqual(await data.getCurrentLessonAudio(lesson.id, "th"), {
    audio: null,
  });
});

test("one Lesson command saves the chapter and a Lesson Text together, or neither", async () => {
  const patch = (id: number, body: unknown) =>
    request(`/lessons/${id}`, "PATCH", body);
  const danish = { languageCode: "da", title: "Titel", content: "Indhold" };

  const draft = await createLesson(90);
  const saved = await patch(draft.id, { chapter: 91, text: danish });
  assert.equal(saved.status, 200);
  const savedDetail = await saved.json();
  assert.equal(savedDetail.chapter, 91);
  assert.deepEqual(savedDetail.lessonTexts, [danish]);
  assert.deepEqual(savedDetail.availableLanguageCodes, ["da"]);
  assert.ok(Date.parse(savedDetail.updatedAt) > Date.parse(draft.updatedAt));

  const corrected = await patch(draft.id, {
    text: { ...danish, content: "Rettet" },
  });
  assert.equal(corrected.status, 200);
  assert.deepEqual((await corrected.json()).lessonTexts, [
    { ...danish, content: "Rettet" },
  ]);

  const before = await read(draft.id);
  for (const field of ["title", "content"]) {
    const blank = await patch(draft.id, {
      chapter: 92,
      text: { ...danish, [field]: "  " },
    });
    assert.equal(blank.status, 422);
    const details = (await blank.json()) as ProblemDetails;
    assert.equal(details.code, "validation_failed");
    assert.deepEqual(
      details.errors?.map((error) => error.path),
      [["text", field]],
    );
  }
  const unsupported = await patch(draft.id, {
    chapter: 92,
    text: { ...danish, languageCode: "xx" },
  });
  assert.equal(unsupported.status, 422);
  assert.equal(await code(unsupported), "unsupported_language");
  // A publication refused on the final state leaves the text unsaved too.
  const incomplete = await patch(draft.id, {
    text: { ...danish, languageCode: "en" },
    status: "PUBLISHED",
  });
  assert.equal(incomplete.status, 409);
  assert.equal(await code(incomplete), "lesson_publication_incomplete");
  assert.deepEqual(await read(draft.id), before);

  // The Thai Lesson Text the publication needs may arrive in the same command.
  const source = await createSource("https://example.com/combined-save");
  await request(`/lessons/${draft.id}/sources/${source.id}`, "PUT", {});
  const published = await patch(draft.id, {
    text: { languageCode: "th", title: "บท", content: "เนื้อหา" },
    status: "PUBLISHED",
  });
  assert.equal(published.status, 200);
  const publishedDetail = await published.json();
  assert.equal(publishedDetail.status, "PUBLISHED");
  assert.deepEqual(publishedDetail.availableLanguageCodes, ["da", "th"]);

  const notEditable = await patch(draft.id, { text: danish });
  assert.equal(notEditable.status, 409);
  assert.equal(await code(notEditable), "lesson_not_editable");
  assert.deepEqual(await read(draft.id), publishedDetail);
});

test("publication gives the version: 1.0 first, then the chapter's highest version raised by the change kind", async () => {
  const source = await createSource("https://example.com/versions");
  const publishableDraft = async (chapter: number) => {
    const draft = await createLesson(chapter);
    await request(`/lessons/${draft.id}/texts/th`, "PUT", {
      title: "บท",
      content: "เนื้อหา",
    });
    await request(`/lessons/${draft.id}/sources/${source.id}`, "PUT", {});
    return draft.id as number;
  };
  const publish = async (id: number, body: object = {}) =>
    request(`/lessons/${id}`, "PATCH", { status: "PUBLISHED", ...body });
  const version = async (response: Response) => {
    assert.equal(response.status, 200);
    const { version, versionPatch } = await response.json();
    return `${version}.${versionPatch}`;
  };
  const archive = async (id: number) =>
    assert.equal(
      (await request(`/lessons/${id}`, "PATCH", { status: "ARCHIVED" })).status,
      200,
    );

  // A chapter's first publication is 1.0, whatever kind is sent.
  assert.equal(await version(await publish(await publishableDraft(90))), "1.0");
  for (const [chapter, changeKind] of [
    [91, "content"],
    [92, "fix"],
  ] as const) {
    assert.equal(
      await version(
        await publish(await publishableDraft(chapter), { changeKind }),
      ),
      "1.0",
    );
  }

  // Chapter 93 holds Archived versions 1.0 to 1.10 only, and a Draft. 1.10 is higher
  // than 1.9, and Drafts never count.
  for (let patch = 0; patch <= 10; patch += 1) {
    const id = await publishableDraft(93);
    assert.equal(
      await version(await publish(id, { changeKind: "fix" })),
      `1.${patch}`,
    );
    await archive(id);
  }
  await createLesson(93);
  const fix = await publishableDraft(93);
  const beforeRefusal = await read(fix);
  const refused = await publish(fix);
  assert.equal(refused.status, 422);
  const refusal = (await refused.json()) as ProblemDetails;
  assert.equal(refusal.code, "validation_failed");
  assert.deepEqual(
    refusal.errors?.map((error) => error.path),
    [["changeKind"]],
  );
  assert.deepEqual(await read(fix), beforeRefusal);

  assert.equal(
    await version(await publish(fix, { changeKind: "fix" })),
    "1.11",
  );
  await archive(fix);
  const content = await publishableDraft(93);
  assert.equal(
    await version(await publish(content, { changeKind: "content" })),
    "2.0",
  );
  await archive(content);

  // The version follows the chapter the same command moves the Draft to, and a refusal
  // leaves the chapter where it was.
  const moved = await publishableDraft(94);
  const beforeMove = await read(moved);
  const refusedMove = await publish(moved, { chapter: 93 });
  assert.equal(refusedMove.status, 422);
  assert.deepEqual(await read(moved), beforeMove);
  const movedPublication = await publish(moved, {
    chapter: 93,
    changeKind: "fix",
  });
  assert.equal(await version(movedPublication.clone()), "2.1");
  assert.equal((await movedPublication.json()).chapter, 93);

  // A change kind is refused on anything but a publication, and only content or fix exist.
  const draft = await publishableDraft(95);
  for (const body of [
    { changeKind: "fix" },
    { chapter: 96, changeKind: "content" },
    { status: "ARCHIVED", changeKind: "fix" },
    { status: "PUBLISHED", changeKind: "major" },
  ]) {
    const response = await request(`/lessons/${draft}`, "PATCH", body);
    assert.equal(response.status, 422, JSON.stringify(body));
    assert.equal(await code(response), "validation_failed");
  }
  assert.equal((await read(draft)).status, "DRAFT");
});

let uploadCount = 0;

// Creates a Lesson with a Lesson Text per Language, and completes one upload per entry
// in `uploads`, with its object in storage. Media Asset routes still call the Data
// Service, so the uploads go through the data module.
async function lessonWithAudio(chapter: number, uploads: string[]) {
  const lesson = await createLesson(chapter);
  for (const languageCode of new Set(["th", ...uploads])) {
    await request(`/lessons/${lesson.id}/texts/${languageCode}`, "PUT", {
      title: "Title",
      content: "Content",
    });
  }
  const assets: { id: number; objectKey: string }[] = [];
  for (const languageCode of uploads) {
    const asset = await pendingUpload(languageCode);
    completeMediaAssetResponseSchema.parse(
      await data.completeMediaAsset(asset.id, {
        lessonId: lesson.id,
        languageCode,
      }),
    );
    assets.push({ id: asset.id, objectKey: asset.objectKey });
  }
  return { lesson, assets };
}

async function pendingUpload(languageCode: string) {
  uploadCount += 1;
  const objectKey = `audio/00000000-0000-4000-8000-${String(uploadCount).padStart(12, "0")}.mp3`;
  const asset = mediaAssetResponseSchema.parse(
    await data.createPendingMediaAsset({
      languageCode,
      storageProvider: "s3",
      storageContainer: "citizenship-audio",
      objectKey,
      originalFilename: "lesson.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 1,
    }),
  );
  storage.putObject(objectKey, { contentType: "audio/mpeg", sizeBytes: 1 });
  return asset;
}

async function mediaAssetStatus(id: number) {
  return mediaAssetResponseSchema.parse(await data.getMediaAsset(id)).status;
}

async function inStorage(objectKey: string) {
  return storage.inspectObject(objectKey).then(
    () => true,
    () => false,
  );
}

test("deleting a Draft removes its texts, citations, and audio, and deletes the objects of the Media Assets it used", async () => {
  // Two Thai renditions, so the superseded one goes too, and a Danish one.
  const { lesson: draft, assets } = await lessonWithAudio(81, [
    "th",
    "th",
    "da",
  ]);
  const { lesson: other, assets: otherAssets } = await lessonWithAudio(82, [
    "th",
  ]);
  const source = await createSource("https://example.test/kept-after-delete");
  await request(`/lessons/${draft.id}/sources/${source.id}`, "PUT", {
    pageFrom: 2,
  });
  const pending = await pendingUpload("th");

  const deleted = await request(`/lessons/${draft.id}`, "DELETE");

  assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), "");
  const gone = await request(`/lessons/${draft.id}`);
  assert.equal(gone.status, 404);
  assert.equal(await code(gone), "lesson_not_found");
  for (const asset of assets) {
    assert.equal(await mediaAssetStatus(asset.id), "DELETED");
    assert.equal(await inStorage(asset.objectKey), false);
  }
  // Nothing outside the Draft changes: a PENDING upload has no link to a Lesson.
  assert.equal(await mediaAssetStatus(pending.id), "PENDING");
  assert.equal(await inStorage(pending.objectKey), true);
  for (const asset of otherAssets) {
    assert.equal(await mediaAssetStatus(asset.id), "READY");
    assert.equal(await inStorage(asset.objectKey), true);
    assert.equal(
      currentLessonAudioResponseSchema.parse(
        await data.getCurrentLessonAudio(other.id, "th"),
      ).audio?.mediaAssetId,
      asset.id,
    );
  }
  const { items } = await (await request("/sources")).json();
  assert.deepEqual(
    items.map(({ url }: { url: string }) => url),
    [source.url],
  );

  const again = await request(`/lessons/${draft.id}`, "DELETE");
  assert.equal(again.status, 404);
  assert.equal(await code(again), "lesson_not_found");
});

test("only Drafts can be deleted, and a Draft without audio deletes with no Media Assets", async () => {
  const source = await createSource("https://example.test/delete-refusals");
  const publish = async (id: number) => {
    await request(`/lessons/${id}/sources/${source.id}`, "PUT", {});
    const published = await request(`/lessons/${id}`, "PATCH", {
      status: "PUBLISHED",
      changeKind: "fix",
    });
    assert.equal(published.status, 200);
  };
  const { lesson: archived, assets: archivedAssets } = await lessonWithAudio(
    83,
    ["th"],
  );
  await publish(archived.id);
  await request(`/lessons/${archived.id}`, "PATCH", { status: "ARCHIVED" });
  const { lesson: published, assets: publishedAssets } = await lessonWithAudio(
    83,
    ["th"],
  );
  await publish(published.id);

  for (const [lesson, assets] of [
    [archived, archivedAssets],
    [published, publishedAssets],
  ] as const) {
    const before = await read(lesson.id);
    const refused = await request(`/lessons/${lesson.id}`, "DELETE");
    assert.equal(refused.status, 409);
    const problem = (await refused.json()) as ProblemDetails;
    assert.equal(problem.code, "lesson_not_editable");
    assert.equal(problem.detail, "Only Draft Lessons can be deleted.");
    assert.deepEqual(await read(lesson.id), before);
    for (const asset of assets) {
      assert.equal(await mediaAssetStatus(asset.id), "READY");
      assert.equal(await inStorage(asset.objectKey), true);
    }
  }

  const missing = await request("/lessons/987654", "DELETE");
  assert.equal(missing.status, 404);
  assert.equal(await code(missing), "lesson_not_found");

  const { lesson: silent } = await lessonWithAudio(84, []);
  const deleted = await request(`/lessons/${silent.id}`, "DELETE");
  assert.equal(deleted.status, 204);
  assert.equal((await request(`/lessons/${silent.id}`)).status, 404);
});
