import assert from "node:assert/strict";
import { test } from "node:test";

import { code, useBackend } from "../../testing/backend.js";

const { app, storage, request, createLesson, upload } = useBackend();
const mobile = (path: string) => app.request(`/api/mobile/lessons${path}`);
const cite = async (lessonId: number, url: string) => {
  const source = await (
    await request("/sources", "POST", { url, publishedAt: null })
  ).json();
  await request(`/lessons/${lessonId}/sources/${source.id}`, "PUT", {});
  return source;
};

test("the Mobile API serves Published Lessons in a Language and nothing else", async () => {
  const published = await createLesson(50);
  await request(`/lessons/${published.id}/texts/th`, "PUT", {
    title: "บท",
    content: "เนื้อหา",
  });
  const source = await cite(published.id, "https://example.com/mobile");
  assert.equal(
    (
      await request(`/lessons/${published.id}`, "PATCH", {
        status: "PUBLISHED",
      })
    ).status,
    200,
  );
  const draft = await createLesson(51);
  await request(`/lessons/${draft.id}/texts/th`, "PUT", {
    title: "ร่าง",
    content: "ร่าง",
  });

  for (const path of ["", "?language=th"]) {
    const list = await mobile(path);
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), {
      items: [
        {
          id: published.id,
          chapter: 50,
          version: 1,
          versionPatch: 0,
          languageCode: "th",
          title: "บท",
        },
      ],
    });
  }
  assert.deepEqual(await (await mobile("?language=da")).json(), { items: [] });

  const detail = await mobile(`/${published.id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(await detail.json(), {
    id: published.id,
    chapter: 50,
    version: 1,
    versionPatch: 0,
    languageCode: "th",
    title: "บท",
    content: "เนื้อหา",
    availableLanguageCodes: ["th"],
    lessonSources: [
      {
        id: source.id,
        url: source.url,
        publishedAt: null,
        pageFrom: null,
        pageTo: null,
        sectionReference: null,
      },
    ],
    audio: null,
  });

  for (const [path, status, expected] of [
    [`/${draft.id}`, 404, "lesson_not_found"],
    [`/${published.id}?language=da`, 404, "lesson_text_not_found"],
    [`/${published.id}?language=zz`, 422, "unsupported_language"],
    ["?language=zz", 422, "unsupported_language"],
  ] as const) {
    const response = await mobile(path);
    assert.equal(response.status, status, path);
    assert.equal(await code(response), expected, path);
  }
});

test("the Mobile API gives a Published Lesson's current audio a fresh Playback URL", async () => {
  const lesson = await createLesson(74);
  for (const languageCode of ["th", "da"]) {
    await request(`/lessons/${lesson.id}/texts/${languageCode}`, "PUT", {
      title: "Title",
      content: "Content",
    });
  }
  await upload(lesson.id, "th");
  await cite(lesson.id, "https://example.com/current-audio");
  assert.equal(
    (await request(`/lessons/${lesson.id}`, "PATCH", { status: "PUBLISHED" }))
      .status,
    200,
  );
  const second = await upload(lesson.id, "th");
  assert.equal(second.completion.lessonAudio.audioVersion, 2);

  const signed = storage.playbackAuthorizations.length;
  for (let read = 1; read <= 2; read += 1) {
    const thai = await mobile(`/${lesson.id}?language=th`);
    assert.equal(thai.status, 200);
    assert.equal(thai.headers.get("cache-control"), "no-store");
    const { playbackExpiresAt, ...audio } = (await thai.json()).audio;
    assert.deepEqual(audio, {
      mediaAssetId: second.id,
      audioVersion: 2,
      contentType: "audio/mpeg",
      sizeBytes: 1,
      durationMs: null,
      playbackUrl: `https://storage.invalid/${second.objectKey}?playback=1`,
    });
    assert.ok(Date.parse(playbackExpiresAt) > Date.now());
    assert.deepEqual(
      storage.playbackAuthorizations.slice(signed),
      Array(read).fill(second.objectKey),
    );
  }

  const danish = await mobile(`/${lesson.id}?language=da`);
  assert.equal((await danish.json()).audio, null);
  const { items } = await (await mobile("?language=th")).json();
  assert.deepEqual(Object.keys(items[0]).sort(), [
    "chapter",
    "id",
    "languageCode",
    "title",
    "version",
    "versionPatch",
  ]);
});
