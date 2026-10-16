import assert from "node:assert/strict";
import { test } from "node:test";
import {
  problemDetailsSchema,
  sourceResponseSchema,
} from "@ez-dk-citizen/api-contracts";

import { createBffApp } from "../../app.js";
import { DataServiceError } from "../../data-service/client.js";
import { createTestDataServiceClient } from "../../testing/data-service-client.js";

test("BFF creates and lists canonical Sources through its client seam", async () => {
  const source = sourceResponseSchema.parse({
    id: 3,
    url: "https://example.com/source",
    publishedAt: "2026-01-01T00:00:00.000Z",
  });
  const calls: string[] = [];
  const conflict = new DataServiceError(
    problemDetailsSchema.parse({
      type: "https://ez-dk-citizen.invalid/problems/source_url_conflict",
      title: "Conflict",
      status: 409,
      detail: "A Source with this URL already exists.",
      instance: "/internal/sources",
      code: "source_url_conflict",
      requestId: "downstream",
    }),
  );
  const client = createTestDataServiceClient({
    async createSource(input, requestId) {
      if (input.url.endsWith("conflict")) throw conflict;
      calls.push(`${input.url}:${input.publishedAt}:${requestId}`);
      return source;
    },
    async listSources(requestId) {
      calls.push(`list:${requestId}`);
      return { items: [source] };
    },
  });
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    dataServiceClient: client,
  });

  const unauthorized = await app.request("/api/admin/sources", {
    method: "POST",
  });
  assert.equal(unauthorized.status, 401);

  const invalid = await app.request("/api/admin/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: "ftp://example.com", publishedAt: null }),
  });
  assert.equal(invalid.status, 422);

  const unknownProperty = await app.request("/api/admin/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: "https://example.com/source",
      publishedAt: null,
      extra: true,
    }),
  });
  assert.equal(unknownProperty.status, 422);

  const malformed = await app.request("/api/admin/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
      "X-Request-ID": "malformed-request",
    },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.equal(
    malformed.headers.get("content-type"),
    "application/problem+json",
  );
  assert.equal(malformed.headers.get("x-request-id"), "malformed-request");
  const malformedProblem = problemDetailsSchema.parse(await malformed.json());
  assert.equal(malformedProblem.code, "malformed_json");
  assert.equal(malformedProblem.requestId, "malformed-request");
  assert.equal(malformedProblem.instance, "/api/admin/sources");

  const nonJson = await app.request("/api/admin/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "text/plain",
    },
    body: "https://example.com/source",
  });
  assert.equal(nonJson.status, 422);

  const created = await app.request("/api/admin/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
      "X-Request-ID": "request-3",
    },
    body: JSON.stringify({
      url: " https://example.com/source ",
      publishedAt: "2026-01-01T00:00:00Z",
    }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("location"), "/api/admin/sources/3");
  assert.deepEqual(await created.json(), source);

  const duplicate = await app.request("/api/admin/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: "https://example.com/conflict",
      publishedAt: null,
    }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, "source_url_conflict");

  const listed = await app.request("/api/admin/sources", {
    headers: { Authorization: "Bearer admin-token" },
  });
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), { items: [source] });
  assert.equal(
    calls[0],
    "https://example.com/source:2026-01-01T00:00:00Z:request-3",
  );
  assert.match(calls[1]!, /^list:[\da-f-]{36}$/);
});

test("BFF passes Source corrections and their refusals through its client seam", async () => {
  const refusal = (status: number, code: string, detail: string) =>
    new DataServiceError(
      problemDetailsSchema.parse({
        type: `https://ez-dk-citizen.invalid/problems/${code}`,
        title: "Problem",
        status,
        detail,
        instance: "/internal/sources/3",
        code,
        requestId: "downstream",
      }),
    );
  const calls: unknown[] = [];
  const client = createTestDataServiceClient({
    async updateSource(id, input, requestId) {
      calls.push({ id, input, requestId });
      if (id === 404)
        throw refusal(404, "source_not_found", "Source was not found.");
      if (input.url?.endsWith("conflict"))
        throw refusal(
          409,
          "source_url_conflict",
          "A Source with this URL already exists.",
        );
      return {
        id,
        url: input.url ?? "https://example.com/kept",
        publishedAt: null,
      };
    },
  });
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    dataServiceClient: client,
  });
  const update = (id: number | string, body: unknown) =>
    app.request(`/api/admin/sources/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
        "X-Request-ID": "request-7",
      },
      body: JSON.stringify(body),
    });

  assert.equal(
    (await app.request("/api/admin/sources/3", { method: "PATCH" })).status,
    401,
  );
  const invalid = await update(3, { url: "ftp://example.com" });
  assert.equal(invalid.status, 422);
  assert.deepEqual(
    problemDetailsSchema
      .parse(await invalid.json())
      .errors?.map((entry) => entry.path),
    [["url"]],
  );
  assert.equal((await update(3, {})).status, 422);
  assert.equal((await update("abc", { publishedAt: null })).status, 422);
  assert.deepEqual(calls, []);

  const updated = await update(3, {
    url: " https://example.com/fixed ",
    publishedAt: null,
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), {
    id: 3,
    url: "https://example.com/fixed",
    publishedAt: null,
  });
  assert.deepEqual(calls, [
    {
      id: 3,
      input: { url: "https://example.com/fixed", publishedAt: null },
      requestId: "request-7",
    },
  ]);

  const conflict = await update(3, { url: "https://example.com/conflict" });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, "source_url_conflict");

  const missing = await update(404, { publishedAt: null });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "source_not_found");
});
