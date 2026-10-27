import assert from "node:assert/strict";
import { test } from "node:test";
import {
  problemDetailsSchema,
  sourceResponseSchema,
} from "@ez-dk-citizen/api-contracts";
import { fail, ok } from "@ez-dk-citizen/data";

import { createBackendApp } from "../../app.js";
import { createTestDataModule } from "../../testing/data-module.js";

test("Backend creates and lists canonical Sources through the data module", async () => {
  const source = sourceResponseSchema.parse({
    id: 3,
    url: "https://example.com/source",
    publishedAt: "2026-01-01T00:00:00.000Z",
  });
  const calls: string[] = [];
  const data = createTestDataModule({
    async createSource(input) {
      if (input.url.endsWith("conflict")) return fail("source_url_conflict");
      calls.push(`${input.url}:${input.publishedAt}`);
      return ok(source);
    },
    async listSources() {
      return { items: [source] };
    },
  });
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    data,
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
    body: JSON.stringify({
      url: "https://example.com/source",
      publishedAt: null,
    }),
  });
  assert.equal(nonJson.status, 422);
  assert.equal(
    problemDetailsSchema.parse(await nonJson.json()).code,
    "invalid_content_type",
  );

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
  assert.deepEqual(calls, ["https://example.com/source:2026-01-01T00:00:00Z"]);
});

test("Backend maps Source corrections and their refusals from the data module", async () => {
  const calls: unknown[] = [];
  const data = createTestDataModule({
    async updateSource(id, input) {
      calls.push({ id, input });
      if (id === 404) return fail("source_not_found");
      if (input.url?.endsWith("conflict")) return fail("source_url_conflict");
      return ok({
        id,
        url: input.url ?? "https://example.com/kept",
        publishedAt: null,
      });
    },
  });
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    data,
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
    },
  ]);

  const conflict = await update(3, { url: "https://example.com/conflict" });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, "source_url_conflict");

  const missing = await update(404, { publishedAt: null });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "source_not_found");
});
