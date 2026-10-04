import {
  completeMediaAssetRequestSchema,
  completeMediaAssetResponseSchema,
  createUploadIntentRequestSchema,
  mediaAssetIdParamsSchema,
  uploadIntentResponseSchema,
  validateJson,
  validateRequest,
  type RequestIdEnvironment,
  type CreateUploadIntentRequest,
  type CompleteMediaAssetRequest,
} from "@ez-dk-citizen/api-contracts";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";

import type { BffAppOptions } from "../../app.js";
import { DataServiceError } from "../../data-service/client.js";
import { mapDataServiceError } from "../../errors/downstream.js";
import { problem } from "../../errors/problem-details.js";
import {
  logStorageFailure,
  storageFailureProblem,
} from "../../errors/storage.js";

export function createAdminMediaRoutes(
  options: Pick<
    BffAppOptions,
    "dataServiceClient" | "storage" | "storageBucket" | "objectKeyGenerator"
  >,
) {
  return new Hono<RequestIdEnvironment>()
    .post(
      "/upload-intents",
      validateJson(createUploadIntentRequestSchema),
      async (c) => {
        const input = c.req.valid("json") as CreateUploadIntentRequest;
        if (!options.dataServiceClient) {
          return problem(
            c,
            502,
            "data_service_unavailable",
            "The Data Service is unavailable.",
          );
        }
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
        try {
          const mediaAsset =
            await options.dataServiceClient.createPendingMediaAsset(
              {
                languageCode: input.languageCode,
                storageProvider: "s3",
                storageContainer: options.storageBucket,
                objectKey,
                originalFilename: input.originalFilename,
                contentType: input.contentType,
                sizeBytes: input.sizeBytes,
              },
              c.get("requestId"),
            );
          const authorization = await options.storage
            .createUploadAuthorization({
              key: objectKey,
              contentType: input.contentType,
              sizeBytes: input.sizeBytes,
            })
            .catch((error: unknown) => {
              logStorageFailure(
                c.get("requestId"),
                "upload",
                mediaAsset.id,
                error,
              );
              throw error;
            });
          return c.json(
            uploadIntentResponseSchema.parse({
              mediaAssetId: mediaAsset.id,
              ...authorization,
            }),
            201,
          );
        } catch (error) {
          if (error instanceof DataServiceError)
            return mapDataServiceError(c, error);
          return problem(
            c,
            502,
            "storage_unavailable",
            "Storage authorization is unavailable.",
          );
        }
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
        if (!options.dataServiceClient) {
          return problem(
            c,
            502,
            "data_service_unavailable",
            "The Data Service is unavailable.",
          );
        }
        if (!options.storage) {
          return problem(
            c,
            502,
            "storage_unavailable",
            "Storage is unavailable.",
          );
        }

        try {
          const asset = await options.dataServiceClient.getMediaAsset(
            mediaAssetId,
            c.get("requestId"),
          );
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
              await options.dataServiceClient.failMediaAsset(
                mediaAssetId,
                c.get("requestId"),
              );
              try {
                await options.storage.deleteObject(asset.objectKey);
              } catch (error) {
                logStorageFailure(
                  c.get("requestId"),
                  "delete",
                  asset.id,
                  error,
                );
              }
              return problem(
                c,
                422,
                "invalid_uploaded_media",
                "Uploaded object does not match its declared media metadata.",
              );
            }
          }
          return c.json(
            completeMediaAssetResponseSchema.parse(
              await options.dataServiceClient.completeMediaAsset(
                mediaAssetId,
                input,
                c.get("requestId"),
              ),
            ),
          );
        } catch (error) {
          if (error instanceof DataServiceError)
            return mapDataServiceError(c, error);
          return problem(
            c,
            502,
            "storage_unavailable",
            "Storage is unavailable.",
          );
        }
      },
    );
}
