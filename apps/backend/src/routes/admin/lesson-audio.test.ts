import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { currentLessonAudioResultSchema, fail, ok } from "@ez-dk-citizen/data";

import { createBackendApp } from "../../app.ts";
import type { Storage } from "../../storage.ts";
import { createTestDataModule } from "../../testing/data-module.ts";
import { createFakeStorage } from "../../testing/storage.ts";

const key = "audio/123e4567-e89b-12d3-a456-426614174000.mp3";
const current = currentLessonAudioResultSchema.parse({
  audio: {
    mediaAssetId: 9,
    audioVersion: 2,
    originalFilename: "chapter-2-th.mp3",
    objectKey: key,
    contentType: "audio/mpeg",
    sizeBytes: 4096,
    durationMs: null,
  },
});
const headers = {
  Authorization: "Bearer admin-token",
  "X-Request-ID": "admin-audio",
};

test("admin current audio requires the admin token", async () => {
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage: createFakeStorage(),
    data: createTestDataModule({
      async getCurrentLessonAudio() {
        throw new Error("Unauthenticated requests must not read Lesson Audio");
      },
    }),
  });

  const response = await app.request("/api/admin/lessons/7/audio/th");
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "authentication_required");
});

test("admin current audio signs one fresh Playback URL and hides storage identity", async () => {
  const reads: string[] = [];
  // Numbers each URL, so the test can tell a fresh signature from a reused one.
  let signed = 0;
  const createPlaybackAuthorization = mock.fn<
    Storage["createPlaybackAuthorization"]
  >(async () => ({
    playbackUrl: `https://storage.invalid/playback-${++signed}`,
    expiresAt: "2026-01-01T01:00:00.000Z",
  }));
  // Only signing is supplied, so inspecting object metadata would fail the read.
  const storage = createFakeStorage({ createPlaybackAuthorization });
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage,
    data: createTestDataModule({
      async getCurrentLessonAudio(lessonId, languageCode) {
        reads.push(`${lessonId}:${languageCode}`);
        return ok(languageCode === "da" ? { audio: null } : current);
      },
    }),
  });

  const response = await app.request("/api/admin/lessons/7/audio/th", {
    headers,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.text();
  assert.deepEqual(JSON.parse(body), {
    audio: {
      mediaAssetId: 9,
      audioVersion: 2,
      originalFilename: "chapter-2-th.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 4096,
      durationMs: null,
      playbackUrl: "https://storage.invalid/playback-1",
      playbackExpiresAt: "2026-01-01T01:00:00.000Z",
    },
  });
  assert.equal(body.includes(key), false);
  assert.deepEqual(
    createPlaybackAuthorization.mock.calls.map((call) => call.arguments[0]),
    [key],
  );

  const again = await app.request("/api/admin/lessons/7/audio/th", {
    headers,
  });
  assert.equal(
    (await again.json()).audio.playbackUrl,
    "https://storage.invalid/playback-2",
  );

  const none = await app.request("/api/admin/lessons/7/audio/da", { headers });
  assert.equal(none.status, 200);
  assert.equal(none.headers.get("cache-control"), "no-store");
  assert.deepEqual(await none.json(), { audio: null });
  assert.equal(createPlaybackAuthorization.mock.callCount(), 2);
  assert.deepEqual(reads, ["7:th", "7:th", "7:da"]);
});

test("admin current audio maps data module refusals to Problem Details", async () => {
  for (const [outcome, status, detail] of [
    ["lesson_not_found", 404, "Lesson was not found."],
    ["unsupported_language", 422, "Language is not supported."],
  ] as const) {
    const app = createBackendApp(async () => undefined, {
      adminApiToken: "admin-token",
      storage: createFakeStorage(),
      data: createTestDataModule({
        async getCurrentLessonAudio() {
          return fail(outcome);
        },
      }),
    });

    const response = await app.request("/api/admin/lessons/7/audio/th", {
      headers,
    });
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.code, outcome);
    assert.equal(body.detail, detail);
  }
});

test("admin current audio maps signing failures to storage problems and logs them without secrets", async () => {
  for (const [name, status, code] of [
    ["SlowDown", 503, "storage_unavailable"],
    ["TimeoutError", 504, "storage_timeout"],
    ["NotFound", 503, "storage_unavailable"],
  ] as const) {
    const storage = createFakeStorage({
      async createPlaybackAuthorization() {
        throw Object.assign(
          new Error(
            `Bearer admin-token ${key} https://storage.invalid/leak?signature=secret`,
          ),
          { name, $metadata: { requestId: "aws-request" } },
        );
      },
    });
    const app = createBackendApp(async () => undefined, {
      adminApiToken: "admin-token",
      storage,
      data: createTestDataModule({
        async getCurrentLessonAudio() {
          return ok(current);
        },
      }),
    });
    const logs: unknown[] = [];
    const originalLog = console.log;
    console.log = (entry: unknown) => logs.push(entry);
    let response: Response;
    try {
      response = await app.request("/api/admin/lessons/7/audio/th", {
        headers,
      });
    } finally {
      console.log = originalLog;
    }

    assert.equal(response.status, status);
    const body = await response.text();
    assert.equal(JSON.parse(body).code, code);
    assert.equal(JSON.parse(body).requestId, "admin-audio");
    for (const secret of [key, "storage.invalid", "admin-token"]) {
      assert.equal(body.includes(secret), false);
      assert.equal(logs.join("\n").includes(secret), false);
    }
    assert.deepEqual(
      logs
        .map((entry) => JSON.parse(String(entry)))
        .find((entry) => entry.operation === "playback"),
      {
        requestId: "admin-audio",
        operation: "playback",
        mediaAssetId: 9,
        storageErrorCode: name,
        storageRequestId: "aws-request",
      },
    );
  }
});
