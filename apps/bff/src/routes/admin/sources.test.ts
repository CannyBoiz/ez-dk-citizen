import {
  problemDetailsSchema,
  sourceResponseSchema,
} from "@ez-dk-citizen/api-contracts";
import assert from "node:assert/strict";
import { test } from "node:test";

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
    },
    body: "{",
  });
  assert.equal(malformed.status, 400);

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
