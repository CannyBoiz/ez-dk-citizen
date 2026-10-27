import { randomUUID } from "node:crypto";
import {
  completeMediaAssetRequestSchema,
  completeMediaAssetResponseSchema,
  createUploadIntentRequestSchema,
  mediaAssetIdParamsSchema,
  uploadIntentResponseSchema,
} from "@ez-dk-citizen/api-contracts";
import type { DataModule } from "@ez-dk-citizen/data";
import { Hono } from "hono";

import type { BackendAppOptions } from "../../app.js";
import { problem, refuse, refuseWith } from "../../errors/problem-details.js";
import {
  logStorageFailure,
  storageFailureProblem,
} from "../../errors/storage.js";
import type { RequestIdEnvironment } from "../../middleware/request-id.js";
import { validateJson, validateRequest } from "../../middleware/validation.js";
import type { StoredObject, UploadAuthorization } from "../../storage.js";

// Completion answers a missing Lesson Text with 409 (Stage 3 spec, ADR-0001), where the
// Mobile API answers 404.
const refuseCompletion = refuseWith({
  lesson_text_not_found: [409, "Lesson Text was not found."],
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
        const input = c.req.valid("json");
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
        if (!mediaAsset.ok) {
          return refuse(c, mediaAsset.code);
        }
        let authorization: UploadAuthorization;
        try {
          authorization = await options.storage.createUploadAuthorization({
            key: objectKey,
            contentType: input.contentType,
            sizeBytes: input.sizeBytes,
          });
        } catch (error) {
          logStorageFailure(
            c.get("requestId"),
            "upload",
            mediaAsset.value.id,
            error,
          );
          return problem(
            c,
            502,
            "storage_unavailable",
            "Storage authorization is unavailable.",
          );
        }
        return c.json(
          uploadIntentResponseSchema.parse({
            mediaAssetId: mediaAsset.value.id,
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
        const { mediaAssetId } = c.req.valid("param");
        const input = c.req.valid("json");
        if (!options.storage) {
          return problem(
            c,
            502,
            "storage_unavailable",
            "Storage is unavailable.",
          );
        }

        const found = await data.getMediaAsset(mediaAssetId);
        if (!found.ok) {
          return refuseCompletion(c, found.code);
        }
        const asset = found.value;
        // A READY retry or a FAILED asset needs no inspection.
        let storedObject: StoredObject | undefined;
        if (asset.status === "PENDING") {
          try {
            storedObject = await options.storage.inspectObject(asset.objectKey);
          } catch (error) {
            logStorageFailure(c.get("requestId"), "inspect", asset.id, error);
            return storageFailureProblem(c, error);
          }
        }
        const completed = await data.completeMediaAsset(
          mediaAssetId,
          input,
          storedObject,
        );
        // The data module has marked the asset FAILED; a failed delete leaves an inert orphan.
        if (!completed.ok && completed.code === "invalid_uploaded_media") {
          try {
            await options.storage.deleteObject(asset.objectKey);
          } catch (error) {
            logStorageFailure(c.get("requestId"), "delete", asset.id, error);
          }
        }
        return completed.ok
          ? c.json(completeMediaAssetResponseSchema.parse(completed.value))
          : refuseCompletion(c, completed.code);
      },
    );
}
