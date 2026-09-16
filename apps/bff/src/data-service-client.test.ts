import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createDataServiceClient,
  DataServiceError,
} from "./data-service-client.js";

test("Data Service client preserves boundary failures and correlation", async (context) => {
  const originalFetch = globalThis.fetch;

  await context.test("forwards credentials and request IDs", async () => {
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      calls += 1;
      assert.equal(input.toString(), "http://data.example/internal/lessons");
      assert.equal(
        init?.headers && new Headers(init.headers).get("Authorization"),
        "Bearer data-token",
      );
      assert.equal(
        init?.headers && new Headers(init.headers).get("X-Request-ID"),
        "request-1",
      );
      return Response.json({ items: [] });
    };

    try {
      assert.deepEqual(
        await createDataServiceClient(
          "http://data.example",
          "data-token",
        ).listLessons("request-1"),
        { items: [] },
      );
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await context.test(
    "reads and completes a Media Asset through its narrow routes",
    async () => {
      const calls: Array<{ url: string; method?: string; body?: string }> = [];
      globalThis.fetch = async (input, init) => {
        calls.push({
          url: input.toString(),
          method: init?.method,
          body: init?.body as string | undefined,
        });
        if (init?.method === "GET") {
          return Response.json({
            id: 9,
            storageProvider: "s3",
            storageContainer: "citizenship-audio",
            objectKey: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
            originalFilename: "lesson.mp3",
            contentType: "audio/mpeg",
            sizeBytes: 1,
            durationMs: null,
            status: "PENDING",
            createdAt: "2026-01-01T00:00:00.000Z",
            uploadedAt: null,
          });
        }
        return Response.json({
          mediaAsset: {
            id: 9,
            status: "READY",
            contentType: "audio/mpeg",
            sizeBytes: 1,
            durationMs: null,
            uploadedAt: "2026-01-01T00:01:00.000Z",
          },
          lessonAudio: {
            id: 1,
            lessonId: 7,
            languageCode: "th",
            audioVersion: 1,
            isCurrent: true,
            createdAt: "2026-01-01T00:01:00.000Z",
          },
        });
      };

      try {
        const client = createDataServiceClient(
          "http://data.example",
          "data-token",
        );
        await client.getMediaAsset(9, "request-6");
        await client.failMediaAsset(9, "request-6");
        await client.completeMediaAsset(
          9,
          { lessonId: 7, languageCode: "th" },
          "request-6",
        );
        assert.deepEqual(calls, [
          {
            url: "http://data.example/internal/media-assets/9",
            method: "GET",
            body: undefined,
          },
          {
            url: "http://data.example/internal/media-assets/9/fail",
            method: "POST",
            body: undefined,
          },
          {
            url: "http://data.example/internal/media-assets/9/complete",
            method: "POST",
            body: '{"lessonId":7,"languageCode":"th"}',
          },
        ]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );

  await context.test("does not retry unavailable dependencies", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("offline");
    };

    try {
      await assert.rejects(
        createDataServiceClient(
          "http://data.example",
          "data-token",
        ).listLessons("request-2"),
        (error: unknown) =>
          error instanceof DataServiceError &&
          error.status === 502 &&
          error.details.code === "data_service_unavailable",
      );
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await context.test("maps cancellation to a timeout", async () => {
    globalThis.fetch = async (_input, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("timed out", "TimeoutError")),
        );
      });

    try {
      await assert.rejects(
        createDataServiceClient(
          "http://data.example",
          "data-token",
          1,
        ).listLessons("request-3"),
        (error: unknown) =>
          error instanceof DataServiceError &&
          error.status === 504 &&
          error.details.code === "data_service_timeout",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await context.test("rejects malformed successful responses", async () => {
    globalThis.fetch = async () => Response.json({ unexpected: true });

    try {
      await assert.rejects(
        createDataServiceClient(
          "http://data.example",
          "data-token",
        ).listLessons("request-4"),
        (error: unknown) =>
          error instanceof DataServiceError &&
          error.status === 502 &&
          error.details.code === "invalid_data_service_response",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await context.test("preserves valid downstream Problem Details", async () => {
    globalThis.fetch = async () =>
      Response.json(
        {
          type: "https://ez-dk-citizen.invalid/problems/lesson_not_found",
          title: "Not Found",
          status: 404,
          detail: "Lesson was not found.",
          instance: "/internal/lessons/99",
          code: "lesson_not_found",
          requestId: "downstream-request",
        },
        { status: 404 },
      );

    try {
      await assert.rejects(
        createDataServiceClient("http://data.example", "data-token").getLesson(
          99,
          "request-5",
        ),
        (error: unknown) =>
          error instanceof DataServiceError &&
          error.status === 404 &&
          error.details.code === "lesson_not_found",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
