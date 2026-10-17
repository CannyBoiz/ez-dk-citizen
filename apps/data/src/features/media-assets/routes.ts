import {
  type CompleteMediaAssetRequest,
  type CreatePendingMediaAssetRequest,
  completeMediaAssetRequestSchema,
  createPendingMediaAssetRequestSchema,
  mediaAssetIdParamsSchema,
  problem,
  type RequestIdEnvironment,
  validateJson,
  validateRequest,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";

import type { DataOperations } from "../../data-operations.js";

export function createMediaAssetRoutes(data: DataOperations) {
  const app = new Hono<RequestIdEnvironment>();

  app.post(
    "/",
    validateJson(createPendingMediaAssetRequestSchema),
    async (c) => {
      const input = c.req.valid("json") as CreatePendingMediaAssetRequest;
      const created = await data.createPendingMediaAsset(input);
      if (created === "unsupported_language") {
        return problem(c, 422, created, "Language is not supported.");
      }
      return c.json(created, 201);
    },
  );

  app.get(
    "/:mediaAssetId",
    validateRequest("param", mediaAssetIdParamsSchema),
    async (c) => {
      const { mediaAssetId } = c.req.valid("param") as {
        mediaAssetId: number;
      };
      const asset = await data.getMediaAsset(mediaAssetId);
      if (asset === "media_asset_not_found") {
        return problem(c, 404, asset, "Media Asset was not found.");
      }
      return c.json(asset);
    },
  );

  app.post(
    "/:mediaAssetId/fail",
    validateRequest("param", mediaAssetIdParamsSchema),
    async (c) => {
      const { mediaAssetId } = c.req.valid("param") as {
        mediaAssetId: number;
      };

      const outcome = await data.failMediaAsset(mediaAssetId);

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

      const outcome = await data.completeMediaAsset(mediaAssetId, input);

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
      return c.json(outcome);
    },
  );

  return app;
}
