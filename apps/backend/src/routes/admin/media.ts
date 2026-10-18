import { randomUUID } from "node:crypto";
import {
  type CompleteMediaAssetRequest,
  type CreateUploadIntentRequest,
  completeMediaAssetRequestSchema,
  completeMediaAssetResponseSchema,
  createUploadIntentRequestSchema,
  mediaAssetIdParamsSchema,
  type RequestIdEnvironment,
  uploadIntentResponseSchema,
  validateJson,
  validateRequest,
} from "@ez-dk-citizen/api-contracts";
import type { DataModule } from "@ez-dk-citizen/data";
import { Hono } from "hono";

import type { BackendAppOptions } from "../../app.js";
import { problem, refuseWith } from "../../errors/problem-details.js";
import {
  logStorageFailure,
  storageFailureProblem,
} from "../../errors/storage.js";
import type { UploadAuthorization } from "../../storage.js";

// The refusals the Media Asset routes answer.
const refuse = refuseWith({
  media_asset_not_found: [404, "Media Asset was not found."],
  lesson_not_found: [404, "Lesson was not found."],
  unsupported_language: [422, "Language is not supported."],
  lesson_text_not_found: [409, "Lesson Text was not found."],
  lesson_archived: [409, "Archived Lessons cannot receive audio."],
  media_asset_not_pending: [409, "Media Asset is not pending."],
  media_asset_failed: [
    409,
    "Media Asset failed validation; create a new Upload Intent.",
  ],
  media_asset_rebind_conflict: [
    409,
    "Media Asset is already bound to a different Lesson or Language.",
  ],
});

export function createAdminMediaRoutes(
  data: DataModule,
  options: Pick<
    BackendAppOptions,
    "storage" | "storageBucket" | "objectKeyGenerator"
  >,
) {
  return new Hono<RequestIdEnvironment>()
    .post(
      "/upload-intents",
      validateJson(createUploadIntentRequestSchema),
      async (c) => {
        const input = c.req.valid("json") as CreateUploadIntentRequest;
        if (!options.storage || !options.storageBucket) {
          return problem(
            c,
            502,
            "storage_unavailable",
            "Storage authorization is unavailable.",
          );
        }

        const objectKey =
          options.objectKeyGenerator?.() ?? `audio/${randomUUID()}.mp3`;
        const mediaAsset = await data.createPendingMediaAsset({
          languageCode: input.languageCode,
          storageProvider: "s3",
          storageContainer: options.storageBucket,
          objectKey,
          originalFilename: input.originalFilename,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
        });
        if (mediaAsset === "unsupported_language") {
          return refuse(c, mediaAsset);
        }
        let authorization: UploadAuthorization;
        try {
          authorization = await options.storage.createUploadAuthorization({
            key: objectKey,
            contentType: input.contentType,
            sizeBytes: input.sizeBytes,
          });
        } catch (error) {
          logStorageFailure(c.get("requestId"), "upload", mediaAsset.id, error);
          return problem(
            c,
            502,
            "storage_unavailable",
            "Storage authorization is unavailable.",
          );
        }
        return c.json(
          uploadIntentResponseSchema.parse({
            mediaAssetId: mediaAsset.id,
            ...authorization,
          }),
          201,
        );
      },
    )
    .post(
      "/:mediaAssetId/complete",
      validateRequest("param", mediaAssetIdParamsSchema),
      validateJson(completeMediaAssetRequestSchema),
      async (c) => {
        const { mediaAssetId } = c.req.valid("param") as {
          mediaAssetId: number;
        };
        const input = c.req.valid("json") as CompleteMediaAssetRequest;
        if (!options.storage) {
          return problem(
            c,
            502,
            "storage_unavailable",
            "Storage is unavailable.",
          );
        }

        const asset = await data.getMediaAsset(mediaAssetId);
        if (asset === "media_asset_not_found") {
          return refuse(c, asset);
        }
        if (asset.status === "PENDING") {
          let object: { contentType?: string; sizeBytes?: number };
          try {
            object = await options.storage.inspectObject(asset.objectKey);
          } catch (error) {
            logStorageFailure(c.get("requestId"), "inspect", asset.id, error);
            return storageFailureProblem(c, error);
          }
          if (
            object.contentType !== asset.contentType ||
            object.sizeBytes !== asset.sizeBytes
          ) {
            const failed = await data.failMediaAsset(mediaAssetId);
            if (failed) {
              return refuse(c, failed);
            }
            try {
              await options.storage.deleteObject(asset.objectKey);
            } catch (error) {
              logStorageFailure(c.get("requestId"), "delete", asset.id, error);
            }
            return problem(
              c,
              422,
              "invalid_uploaded_media",
              "Uploaded object does not match its declared media metadata.",
            );
          }
        }
        const completed = await data.completeMediaAsset(mediaAssetId, input);
        return typeof completed === "string"
          ? refuse(c, completed)
          : c.json(completeMediaAssetResponseSchema.parse(completed));
      },
    );
}
