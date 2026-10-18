import {
  lessonDetailSchema,
  mp3Filename,
  nonBlankText,
  nonNegativeInteger,
  positiveInteger,
  safePositiveInteger,
  timestamp,
} from "@ez-dk-citizen/api-contracts";
import { z } from "zod";

// What data module operations return, where the Admin API and Mobile API send something else.
// These carry the storage identity, which the Backend keeps from every client.

const audioObjectKey = z
  .string()
  .regex(
    /^(?:audio|smoke)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$/,
  );

export const mediaAssetStatusSchema = z.enum([
  "PENDING",
  "READY",
  "FAILED",
  "DELETED",
]);

export const mediaAssetSchema = z.strictObject({
  id: safePositiveInteger,
  storageProvider: z.literal("s3"),
  storageContainer: nonBlankText,
  objectKey: audioObjectKey,
  originalFilename: mp3Filename,
  contentType: z.literal("audio/mpeg"),
  sizeBytes: safePositiveInteger,
  durationMs: safePositiveInteger.nullable(),
  status: mediaAssetStatusSchema,
  createdAt: timestamp,
  uploadedAt: timestamp.nullable(),
});

export const publishedLessonAudioSchema = z.strictObject({
  mediaAssetId: safePositiveInteger,
  audioVersion: positiveInteger,
  objectKey: audioObjectKey,
  contentType: z.literal("audio/mpeg"),
  sizeBytes: safePositiveInteger,
  durationMs: safePositiveInteger.nullable(),
});

// The current READY rendition for one Lesson and Language, in any Lesson status.
export const currentLessonAudioSchema = publishedLessonAudioSchema.extend({
  originalFilename: mp3Filename,
});

export const currentLessonAudioResultSchema = z.strictObject({
  audio: currentLessonAudioSchema.nullable(),
});

export const publishedLessonDetailSchema = z.strictObject({
  ...lessonDetailSchema.shape,
  version: positiveInteger,
  versionPatch: nonNegativeInteger,
  currentAudio: publishedLessonAudioSchema.nullable(),
});

export const lessonDetailListSchema = z.strictObject({
  items: z.array(lessonDetailSchema),
});

// The Media Assets a Draft deletion marked DELETED, whose objects the Backend deletes. The
// Backend answers its own client with no body.
export const deleteLessonResultSchema = z.strictObject({
  deletedMediaAssets: z.array(
    z.strictObject({ id: safePositiveInteger, objectKey: audioObjectKey }),
  ),
});

export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type CurrentLessonAudioResult = z.infer<
  typeof currentLessonAudioResultSchema
>;
export type PublishedLessonDetail = z.infer<typeof publishedLessonDetailSchema>;
export type LessonDetailList = z.infer<typeof lessonDetailListSchema>;
export type DeleteLessonResult = z.infer<typeof deleteLessonResultSchema>;
