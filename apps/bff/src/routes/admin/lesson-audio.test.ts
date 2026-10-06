import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentLessonAudioResponseSchema,
  problemDetailsSchema,
} from "@ez-dk-citizen/api-contracts";

import { createBffApp } from "../../app.js";
import { DataServiceError } from "../../data-service/client.js";
import { FakeStorage } from "../../storage.js";
import { createTestDataServiceClient } from "../../testing/data-service-client.js";

const key = "audio/123e4567-e89b-12d3-a456-426614174000.mp3";
const current = currentLessonAudioResponseSchema.parse({
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

function downstreamProblem(status: number, code: string, detail: string) {
  return new DataServiceError(
    problemDetailsSchema.parse({
      type: `https://ez-dk-citizen.invalid/problems/${code}`,
      title: "Problem",
      status,
      detail,
      instance: "/internal/lessons/7/audio/th",
      code,
      requestId: "downstream",
    }),
  );
}

test("admin current audio requires the admin token", async () => {
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage: new FakeStorage(),
    dataServiceClient: createTestDataServiceClient({
      async getCurrentLessonAudio() {
        throw new Error(
          "Unauthenticated requests must not reach the Data Service",
        );
      },
    }),
  });

  const response = await app.request("/api/admin/lessons/7/audio/th");
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "authentication_required");
});

test("admin current audio signs one fresh Playback URL and hides storage identity", async () => {
  const storage = new FakeStorage();
  const keys: string[] = [];
  const reads: string[] = [];
  storage.inspectObject = async () => {
    throw new Error("Playback must not inspect object metadata");
  };
  storage.createPlaybackAuthorization = async (objectKey) => {
    keys.push(objectKey);
    return {
      playbackUrl: `https://storage.invalid/playback-${keys.length}`,
      expiresAt: "2026-01-01T01:00:00.000Z",
    };
  };
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage,
    dataServiceClient: createTestDataServiceClient({
      async getCurrentLessonAudio(lessonId, languageCode, requestId) {
        reads.push(`${lessonId}:${languageCode}:${requestId}`);
        return languageCode === "da" ? { audio: null } : current;
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
  assert.deepEqual(keys, [key]);

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
  assert.equal(keys.length, 2);
  assert.deepEqual(reads, [
    "7:th:admin-audio",
    "7:th:admin-audio",
    "7:da:admin-audio",
  ]);
});

test("admin current audio passes Data Service problems through safely", async () => {
  for (const [error, status, code] of [
    [
      downstreamProblem(404, "lesson_not_found", "Lesson was not found."),
      404,
      "lesson_not_found",
    ],
    [
      downstreamProblem(
        422,
        "unsupported_language",
        "Language is not supported.",
      ),
      422,
      "unsupported_language",
    ],
    [
      downstreamProblem(
        504,
        "data_service_timeout",
        "The Data Service timed out.",
      ),
      504,
      "data_service_timeout",
    ],
    [new Error("socket hang up"), 502, "data_service_unavailable"],
  ] as const) {
    const app = createBffApp(async () => undefined, {
      adminApiToken: "admin-token",
      storage: new FakeStorage(),
      dataServiceClient: createTestDataServiceClient({
        async getCurrentLessonAudio() {
          throw error;
        },
      }),
    });

    const response = await app.request("/api/admin/lessons/7/audio/th", {
      headers,
    });
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
  }
});

test("admin current audio maps signing failures to storage problems and logs them without secrets", async () => {
  for (const [name, status, code] of [
    ["SlowDown", 503, "storage_unavailable"],
    ["TimeoutError", 504, "storage_timeout"],
    ["NotFound", 503, "storage_unavailable"],
  ] as const) {
    const storage = new FakeStorage();
    storage.createPlaybackAuthorization = async () => {
      throw Object.assign(
        new Error(
          `Bearer admin-token ${key} https://storage.invalid/leak?signature=secret`,
        ),
        { name, $metadata: { requestId: "aws-request" } },
      );
    };
    const app = createBffApp(async () => undefined, {
      adminApiToken: "admin-token",
      storage,
      dataServiceClient: createTestDataServiceClient({
        async getCurrentLessonAudio() {
          return current;
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
