import {
  completeMediaAssetRequestSchema,
  completeMediaAssetResponseSchema,
  createPendingMediaAssetRequestSchema,
  mediaAssetIdParamsSchema,
  mediaAssetLookupResponseSchema,
  mediaAssetResponseSchema,
  problem,
  validateJson,
  validateRequest,
  type CompleteMediaAssetRequest,
  type CreatePendingMediaAssetRequest,
  type RequestIdEnvironment,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";

import type { DataDatabase } from "../../db/database.js";
import {
  createPendingMediaAsset,
  failMediaAsset,
  completeMediaAsset,
} from "./mutations.js";
import { findMediaAsset } from "./queries.js";
import {
  toMediaAsset,
  toCompletedMediaAsset,
  toLessonAudio,
} from "./serializers.js";

export function createMediaAssetRoutes(database?: DataDatabase) {
  const app = new Hono<RequestIdEnvironment>();

  app.post(
    "/",
    validateJson(createPendingMediaAssetRequestSchema),
    async (c) => {
      const input = c.req.valid("json") as CreatePendingMediaAssetRequest;
      if (!database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const created = await createPendingMediaAsset(database, input);
      if (created === "unsupported_language") {
        return problem(c, 422, created, "Language is not supported.");
      }
      return c.json(mediaAssetResponseSchema.parse(toMediaAsset(created)), 201);
    },
  );

  app.get(
    "/:mediaAssetId",
    validateRequest("param", mediaAssetIdParamsSchema),
    async (c) => {
      const { mediaAssetId } = c.req.valid("param") as {
        mediaAssetId: number;
      };
      if (!database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }
      const asset = await findMediaAsset(database, mediaAssetId);
      if (!asset)
        return problem(
          c,
          404,
          "media_asset_not_found",
          "Media Asset was not found.",
        );
      return c.json(mediaAssetLookupResponseSchema.parse(toMediaAsset(asset)));
    },
  );

  app.post(
    "/:mediaAssetId/fail",
    validateRequest("param", mediaAssetIdParamsSchema),
    async (c) => {
      const { mediaAssetId } = c.req.valid("param") as {
        mediaAssetId: number;
      };
      if (!database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const outcome = await failMediaAsset(database, mediaAssetId);

      if (outcome === "media_asset_not_found") {
        return problem(c, 404, outcome, "Media Asset was not found.");
      }
      if (outcome === "media_asset_not_pending") {
        return problem(c, 409, outcome, "Media Asset is not pending.");
      }
      return c.body(null, 204);
    },
  );

  app.post(
    "/:mediaAssetId/complete",
    validateRequest("param", mediaAssetIdParamsSchema),
    validateJson(completeMediaAssetRequestSchema),
    async (c) => {
      const { mediaAssetId } = c.req.valid("param") as {
        mediaAssetId: number;
      };
      const input = c.req.valid("json") as CompleteMediaAssetRequest;
      if (!database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const outcome = await completeMediaAsset(database, mediaAssetId, input);

      if (outcome === "media_asset_not_found") {
        return problem(c, 404, outcome, "Media Asset was not found.");
      }
      if (outcome === "lesson_not_found") {
        return problem(c, 404, outcome, "Lesson was not found.");
      }
      if (outcome === "unsupported_language") {
        return problem(c, 422, outcome, "Language is not supported.");
      }
      if (outcome === "lesson_text_not_found") {
        return problem(c, 409, outcome, "Lesson Text was not found.");
      }
      if (outcome === "lesson_archived") {
        return problem(
          c,
          409,
          outcome,
          "Archived Lessons cannot receive audio.",
        );
      }
      if (outcome === "media_asset_not_pending") {
        return problem(c, 409, outcome, "Media Asset is not pending.");
      }
      if (outcome === "media_asset_failed") {
        return problem(
          c,
          409,
          outcome,
          "Media Asset failed validation; create a new Upload Intent.",
        );
      }
      if (outcome === "media_asset_rebind_conflict") {
        return problem(
          c,
          409,
          outcome,
          "Media Asset is already bound to a different Lesson or Language.",
        );
      }
      return c.json(
        completeMediaAssetResponseSchema.parse({
          mediaAsset: toCompletedMediaAsset(outcome.readyAsset),
          lessonAudio: toLessonAudio(outcome.audio),
        }),
      );
    },
  );

  return app;
}
