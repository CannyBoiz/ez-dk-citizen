import { z } from "zod";

export * from "./http.js";

const positiveInteger = z.number().int().positive();
const safePositiveInteger = positiveInteger.refine(Number.isSafeInteger);
const positiveId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger);
const timestamp = z.iso.datetime({ offset: true });
const nonBlankText = z.string().refine((value) => value.trim().length > 0);
const sourceUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => /^https?:\/\//i.test(value));
export const maxUploadSizeBytes = 50 * 1024 * 1024;
const languageCode = z.string().trim().min(1).max(35);
const mp3Filename = z.string().min(1).endsWith(".mp3");
const audioObjectKey = z
  .string()
  .regex(
    /^(?:audio|smoke)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$/,
  );

export const livenessResponseSchema = z.strictObject({
  status: z.literal("ok"),
});

export const readinessResponseSchema = z.strictObject({
  status: z.enum(["ok", "unavailable"]),
});

export const lessonStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

export const lessonIdParamsSchema = z.strictObject({ lessonId: positiveId });
export const mediaAssetIdParamsSchema = z.strictObject({
  mediaAssetId: positiveId,
});
export const lessonSourceParamsSchema = z.strictObject({
  lessonId: positiveId,
  sourceId: positiveId,
});
export const lessonTextParamsSchema = z.strictObject({
  lessonId: positiveId,
  languageCode: z.string().min(1),
});
export const languageQuerySchema = z.strictObject({
  language: z.string().min(1).optional(),
});
export const lessonReadQuerySchema = languageQuerySchema.extend({
  status: lessonStatusSchema.optional(),
});

export const createLessonRequestSchema = z.strictObject({
  chapter: positiveInteger,
  version: positiveInteger,
});

export const patchLessonRequestSchema = z
  .strictObject({
    chapter: positiveInteger.optional(),
    version: positiveInteger.optional(),
    status: lessonStatusSchema.optional(),
  })
  .refine(
    (value) =>
      value.chapter !== undefined ||
      value.version !== undefined ||
      value.status !== undefined,
  );

export const upsertLessonTextRequestSchema = z.strictObject({
  title: nonBlankText,
  content: nonBlankText,
});

export const upsertLessonSourceRequestSchema = z
  .strictObject({
    pageFrom: positiveInteger.nullable().optional(),
    pageTo: positiveInteger.nullable().optional(),
    sectionReference: z.string().nullable().optional(),
  })
  .refine(
    (value) =>
      value.pageFrom == null ||
      value.pageTo == null ||
      value.pageFrom <= value.pageTo,
  );

export const createSourceRequestSchema = z.strictObject({
  url: sourceUrl,
  publishedAt: timestamp.nullable(),
});

export const sourceResponseSchema = z.strictObject({
  id: positiveInteger,
  url: sourceUrl,
  publishedAt: timestamp.nullable(),
});

export const sourceListResponseSchema = z.strictObject({
  items: z.array(sourceResponseSchema),
});

export const lessonSummarySchema = z.strictObject({
  id: positiveInteger,
  chapter: positiveInteger,
  version: positiveInteger,
  status: lessonStatusSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
  availableLanguageCodes: z.array(z.string().min(1)),
});

export const lessonTextResponseSchema = z.strictObject({
  languageCode: z.string().min(1),
  title: nonBlankText,
  content: nonBlankText,
});

export const lessonSourceResponseSchema = z.strictObject({
  id: positiveInteger,
  url: z.url(),
  publishedAt: timestamp.nullable(),
  pageFrom: positiveInteger.nullable(),
  pageTo: positiveInteger.nullable(),
  sectionReference: z.string().nullable(),
});

export const lessonDetailSchema = z.strictObject({
  ...lessonSummarySchema.shape,
  lessonTexts: z.array(lessonTextResponseSchema),
  lessonSources: z.array(lessonSourceResponseSchema),
});

export const lessonListResponseSchema = z.strictObject({
  items: z.array(lessonSummarySchema),
});

export const lessonDetailListResponseSchema = z.strictObject({
  items: z.array(lessonDetailSchema),
});

export const mobileLessonSummarySchema = z.strictObject({
  id: positiveInteger,
  chapter: positiveInteger,
  version: positiveInteger,
  languageCode: z.string().min(1),
  title: nonBlankText,
});

export const mobileLessonAudioSchema = z.strictObject({
  mediaAssetId: safePositiveInteger,
  audioVersion: positiveInteger,
  contentType: z.literal("audio/mpeg"),
  sizeBytes: safePositiveInteger,
  durationMs: safePositiveInteger.nullable(),
  playbackUrl: z.url(),
  playbackExpiresAt: timestamp,
});

export const mobileLessonDetailSchema = z.strictObject({
  ...mobileLessonSummarySchema.shape,
  content: nonBlankText,
  availableLanguageCodes: z.array(z.string().min(1)),
  lessonSources: z.array(lessonSourceResponseSchema),
  audio: mobileLessonAudioSchema.nullable(),
});

export const mobileLessonListResponseSchema = z.strictObject({
  items: z.array(mobileLessonSummarySchema),
});

const uploadSizeBytes = safePositiveInteger.max(maxUploadSizeBytes);

export const createUploadIntentRequestSchema = z.strictObject({
  lessonId: safePositiveInteger,
  languageCode,
  originalFilename: mp3Filename,
  contentType: z.literal("audio/mpeg"),
  sizeBytes: uploadSizeBytes,
});

export const createPendingMediaAssetRequestSchema = z.strictObject({
  languageCode,
  storageProvider: z.literal("s3"),
  storageContainer: nonBlankText,
  objectKey: audioObjectKey,
  originalFilename: mp3Filename,
  contentType: z.literal("audio/mpeg"),
  sizeBytes: uploadSizeBytes,
});

export const completeMediaAssetRequestSchema = z.strictObject({
  lessonId: safePositiveInteger,
  languageCode,
});

export const mediaAssetStatusSchema = z.enum([
  "PENDING",
  "READY",
  "FAILED",
  "DELETED",
]);

export const mediaAssetResponseSchema = z.strictObject({
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
export const mediaAssetLookupResponseSchema = mediaAssetResponseSchema;

export const uploadIntentResponseSchema = z.strictObject({
  mediaAssetId: safePositiveInteger,
  uploadUrl: z.url(),
  uploadHeaders: z.strictObject({
    "Content-Type": z.literal("audio/mpeg"),
    "Content-Length": z.string().regex(/^[1-9]\d*$/),
    "If-None-Match": z.literal("*"),
  }),
  expiresAt: timestamp,
});

export const completedMediaAssetResponseSchema = z.strictObject({
  id: safePositiveInteger,
  status: z.literal("READY"),
  contentType: z.literal("audio/mpeg"),
  sizeBytes: safePositiveInteger,
  durationMs: safePositiveInteger.nullable(),
  uploadedAt: timestamp,
});

export const lessonAudioResponseSchema = z.strictObject({
  id: safePositiveInteger,
  lessonId: safePositiveInteger,
  languageCode,
  audioVersion: positiveInteger,
  isCurrent: z.literal(true),
  createdAt: timestamp,
});

export const publishedLessonAudioSchema = z.strictObject({
  mediaAssetId: safePositiveInteger,
  audioVersion: positiveInteger,
  objectKey: audioObjectKey,
  contentType: z.literal("audio/mpeg"),
  sizeBytes: safePositiveInteger,
  durationMs: safePositiveInteger.nullable(),
});

export const publishedLessonDetailSchema = z.strictObject({
  ...lessonDetailSchema.shape,
  currentAudio: publishedLessonAudioSchema.nullable(),
});

export const completeMediaAssetResponseSchema = z.strictObject({
  mediaAsset: completedMediaAssetResponseSchema,
  lessonAudio: lessonAudioResponseSchema,
});

export const problemDetailsSchema = z.strictObject({
  type: z.url(),
  title: z.string(),
  status: positiveInteger,
  detail: z.string(),
  instance: z.string(),
  code: z.string().min(1),
  requestId: z.string().min(1),
  errors: z
    .array(
      z.strictObject({
        path: z.array(z.union([z.string(), z.number()])),
        message: z.string(),
      }),
    )
    .optional(),
});

export type LivenessResponse = z.infer<typeof livenessResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
export type CreateLessonRequest = z.infer<typeof createLessonRequestSchema>;
export type PatchLessonRequest = z.infer<typeof patchLessonRequestSchema>;
export type UpsertLessonTextRequest = z.infer<
  typeof upsertLessonTextRequestSchema
>;
export type UpsertLessonSourceRequest = z.infer<
  typeof upsertLessonSourceRequestSchema
>;
export type CreateSourceRequest = z.infer<typeof createSourceRequestSchema>;
export type SourceResponse = z.infer<typeof sourceResponseSchema>;
export type SourceListResponse = z.infer<typeof sourceListResponseSchema>;
export type LessonStatus = z.infer<typeof lessonStatusSchema>;
export type LessonSummary = z.infer<typeof lessonSummarySchema>;
export type LessonDetail = z.infer<typeof lessonDetailSchema>;
export type PublishedLessonDetail = z.infer<typeof publishedLessonDetailSchema>;
export type LessonListResponse = z.infer<typeof lessonListResponseSchema>;
export type LessonDetailListResponse = z.infer<
  typeof lessonDetailListResponseSchema
>;
export type MobileLessonDetail = z.infer<typeof mobileLessonDetailSchema>;
export type MobileLessonAudio = z.infer<typeof mobileLessonAudioSchema>;
export type MobileLessonListResponse = z.infer<
  typeof mobileLessonListResponseSchema
>;
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
export type CreateUploadIntentRequest = z.infer<
  typeof createUploadIntentRequestSchema
>;
export type CreatePendingMediaAssetRequest = z.infer<
  typeof createPendingMediaAssetRequestSchema
>;
export type CompleteMediaAssetRequest = z.infer<
  typeof completeMediaAssetRequestSchema
>;
export type MediaAssetResponse = z.infer<typeof mediaAssetResponseSchema>;
export type UploadIntentResponse = z.infer<typeof uploadIntentResponseSchema>;
export type CompleteMediaAssetResponse = z.infer<
  typeof completeMediaAssetResponseSchema
>;
