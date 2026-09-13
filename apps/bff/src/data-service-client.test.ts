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
