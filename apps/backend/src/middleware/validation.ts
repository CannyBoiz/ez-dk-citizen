import { sValidator } from "@hono/standard-validator";
import type { Context } from "hono";
import type { ZodType } from "zod";

import { problem } from "../errors/problem-details.js";
import type { RequestIdEnvironment } from "./request-id.js";

export function validateRequest<
  Target extends "json" | "param" | "query",
  Schema extends ZodType,
>(target: Target, schema: Schema) {
  return sValidator(
    target,
    schema,
    (result, c: Context<RequestIdEnvironment>) => {
      const contentType = c.req
        .header("Content-Type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (target === "json" && contentType !== "application/json") {
        return problem(c, 422, "invalid_content_type", "JSON is required.");
      }
      if (!result.success) {
        return problem(
          c,
          422,
          "validation_failed",
          "Request body failed validation.",
          result.error.map((issue) => ({
            path: (issue.path ?? [])
              .map((segment) =>
                typeof segment === "object" && segment ? segment.key : segment,
              )
              .filter(
                (segment): segment is string | number =>
                  typeof segment === "string" || typeof segment === "number",
              ),
            message: issue.message,
          })),
        );
      }
    },
  );
}

export function validateJson<Schema extends ZodType>(schema: Schema) {
  return validateRequest("json", schema);
}
