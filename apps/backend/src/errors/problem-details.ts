import { problemDetailsSchema } from "@ez-dk-citizen/api-contracts";
import { type DataModule, isDatabaseUnavailable } from "@ez-dk-citizen/data";
import type { Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import type { RequestIdEnvironment } from "../middleware/request-id.js";

const problemTitles = {
  400: "Bad Request",
  401: "Unauthorized",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Content",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

export function problem(
  c: Context<RequestIdEnvironment>,
  status: keyof typeof problemTitles,
  code: string,
  detail: string,
  errors?: Array<{ path: Array<string | number>; message: string }>,
) {
  const body = problemDetailsSchema.parse({
    type: `https://ez-dk-citizen.invalid/problems/${code}`,
    title: problemTitles[status],
    status,
    detail,
    instance: c.req.path,
    code,
    requestId: c.get("requestId"),
    ...(errors ? { errors } : {}),
  });

  return c.body(JSON.stringify(body), status, {
    "Content-Type": "application/problem+json",
  });
}

// Every outcome code a data module operation can return. `change_kind_required` carries a
// field error, so the patchLesson route answers it itself.
type OutcomeCode = Exclude<
  Extract<Awaited<ReturnType<DataModule[keyof DataModule]>>, string>,
  "change_kind_required"
>;
type Refusal = readonly [Parameters<typeof problem>[1], string];

// Each outcome code's status and detail. A route that answers differently declares the
// override at its top through refuseWith.
const refusals: Record<OutcomeCode, Refusal> = {
  unsupported_language: [422, "Language is not supported."],
  lesson_not_found: [404, "Lesson was not found."],
  lesson_text_not_found: [404, "Lesson Text was not found."],
  lesson_not_copyable: [
    409,
    "Only Published and Archived Lessons can be copied.",
  ],
  lesson_not_editable: [409, "Only Draft Lessons can be edited."],
  lesson_lifecycle_conflict: [409, "Lesson status transition is not allowed."],
  published_lesson_conflict: [
    409,
    "This publication does not replace the chapter's current Published Lesson.",
  ],
  lesson_unchanged: [
    409,
    "The Draft's Lesson Texts and Lesson Sources are identical to the Published Lesson's.",
  ],
  lesson_version_conflict: [
    409,
    "A Lesson with this chapter and version already exists.",
  ],
  lesson_archived: [409, "Archived Lessons cannot receive audio."],
  media_asset_not_found: [404, "Media Asset was not found."],
  media_asset_not_pending: [409, "Media Asset is not pending."],
  media_asset_failed: [
    409,
    "Media Asset failed validation; create a new Upload Intent.",
  ],
  invalid_uploaded_media: [
    422,
    "Uploaded object does not match its declared media metadata.",
  ],
  media_asset_rebind_conflict: [
    409,
    "Media Asset is already bound to a different Lesson or Language.",
  ],
  source_not_found: [404, "Source was not found."],
  source_url_conflict: [409, "A Source with this URL already exists."],
};

// Answers an outcome code from `overrides`, or else from the shared table.
export function refuseWith(overrides: Partial<Record<OutcomeCode, Refusal>>) {
  return (c: Parameters<typeof problem>[0], outcome: OutcomeCode) => {
    const [status, detail] = overrides[outcome] ?? refusals[outcome];
    return problem(c, status, outcome, detail);
  };
}

export const refuse = refuseWith({});

export function installProblemDetails(app: Hono<RequestIdEnvironment>) {
  app.onError((error, c) => {
    if (error instanceof HTTPException && error.status === 400) {
      return problem(
        c,
        400,
        "malformed_json",
        "Request body is not valid JSON.",
      );
    }
    if (isDatabaseUnavailable(error)) {
      return problem(
        c,
        503,
        "database_unavailable",
        "The database is unavailable.",
      );
    }
    return problem(
      c,
      500,
      "internal_error",
      "The request could not be completed.",
    );
  });
  app.notFound((c) =>
    problem(c, 404, "not_found", "The requested resource was not found."),
  );
}
