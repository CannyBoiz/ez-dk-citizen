import { z } from "zod";

// Field rules shared with the data module's result shapes.
export const positiveInteger = z.number().int().positive();
export const nonNegativeInteger = z.number().int().nonnegative();
export const safePositiveInteger = positiveInteger.refine(Number.isSafeInteger);
const positiveId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger);
export const timestamp = z.iso.datetime({ offset: true });
export const nonBlankText = z
  .string()
  .refine((value) => value.trim().length > 0);
const sourceUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => /^https?:\/\//i.test(value));
export const maxUploadSizeBytes = 50 * 1024 * 1024;
const languageCode = z.string().trim().min(1).max(35);
export const mp3Filename = z.string().min(1).endsWith(".mp3");

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
export const sourceIdParamsSchema = z.strictObject({ sourceId: positiveId });
export const lessonSourceParamsSchema = z.strictObject({
  lessonId: positiveId,
  sourceId: positiveId,
});
// One Lesson in one Language, as Lesson Text and Lesson Audio routes address it.
export const lessonLanguageParamsSchema = z.strictObject({
  lessonId: positiveId,
  languageCode: z.string().min(1),
});
export const lessonTextParamsSchema = lessonLanguageParamsSchema;
export const languageQuerySchema = z.strictObject({
  language: z.string().min(1).optional(),
});

// A Draft of a chapter, or a new version: a Draft copied from a Published or Archived Lesson,
// which keeps that Lesson's chapter.
export const createLessonRequestSchema = z.union([
  z.strictObject({ chapter: positiveInteger }),
  z.strictObject({ copyFromLessonId: safePositiveInteger }),
]);

// How a later publication raises the chapter's highest version: a content change raises
// major and resets patch (2.1 -> 3.0), a fix raises patch (2.1 -> 2.2).
export const changeKindSchema = z.enum(["content", "fix"]);

export const upsertLessonTextRequestSchema = z.strictObject({
  title: nonBlankText,
  content: nonBlankText,
});

export const patchLessonRequestSchema = z
  .strictObject({
    chapter: positiveInteger.optional(),
    // One Language's Lesson Text, upserted with the rest of the command.
    text: upsertLessonTextRequestSchema
      .extend({ languageCode: z.string().min(1) })
      .optional(),
    status: lessonStatusSchema.optional(),
    changeKind: changeKindSchema.optional(),
    // The chapter's Published Lesson as the admin last saw it, which publication archives.
    replacesLessonId: safePositiveInteger.optional(),
  })
  .refine(
    (value) =>
      value.chapter !== undefined ||
      value.text !== undefined ||
      value.status !== undefined,
  )
  .refine(
    (value) => value.changeKind === undefined || value.status === "PUBLISHED",
    {
      path: ["changeKind"],
      message: "A change kind is allowed only when publishing.",
    },
  )
  .refine(
    (value) =>
      value.replacesLessonId === undefined || value.status === "PUBLISHED",
    {
      path: ["replacesLessonId"],
      message: "A replaced Lesson is allowed only when publishing.",
    },
  );

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

// A correction to a canonical Source: its URL, its publication date (null means unknown), or both.
export const updateSourceRequestSchema = z
  .strictObject({
    url: sourceUrl.optional(),
    publishedAt: timestamp.nullable().optional(),
  })
  .refine(
    (value) => value.url !== undefined || value.publishedAt !== undefined,
  );

export const sourceResponseSchema = z.strictObject({
  id: positiveInteger,
  url: sourceUrl,
  publishedAt: timestamp.nullable(),
});

export const sourceListResponseSchema = z.strictObject({
  items: z.array(sourceResponseSchema),
});

// A Lesson's `major.patch` version, given when it is published: both parts or neither.
const lessonVersionShape = {
  version: positiveInteger.nullable(),
  versionPatch: nonNegativeInteger.nullable(),
};
const hasWholeVersion = (value: {
  version: number | null;
  versionPatch: number | null;
}) => (value.version === null) === (value.versionPatch === null);
const wholeVersionIssue = {
  path: ["versionPatch"],
  message: "A version has both parts or neither.",
};

const lessonSummaryShape = {
  id: positiveInteger,
  chapter: positiveInteger,
  ...lessonVersionShape,
  status: lessonStatusSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
  availableLanguageCodes: z.array(z.string().min(1)),
};

export const lessonSummarySchema = z
  .strictObject(lessonSummaryShape)
  .refine(hasWholeVersion, wholeVersionIssue);

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

const lessonDetailShape = {
  ...lessonSummaryShape,
  lessonTexts: z.array(lessonTextResponseSchema),
  lessonSources: z.array(lessonSourceResponseSchema),
};

export const lessonDetailSchema = z
  .strictObject(lessonDetailShape)
  .refine(hasWholeVersion, wholeVersionIssue);

export const lessonListResponseSchema = z.strictObject({
  items: z.array(lessonSummarySchema),
});

// Mobile lists Published Lessons only, so the version is always whole.
export const mobileLessonSummarySchema = z.strictObject({
  id: positiveInteger,
  chapter: positiveInteger,
  version: positiveInteger,
  versionPatch: nonNegativeInteger,
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

export const completeMediaAssetRequestSchema = z.strictObject({
  lessonId: safePositiveInteger,
  languageCode,
});

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
  isCurrent: z.boolean(),
  createdAt: timestamp,
});

// A Lesson's current audio for the admin, with a fresh Playback URL and no storage identity.
export const adminLessonAudioSchema = z.strictObject({
  mediaAssetId: safePositiveInteger,
  audioVersion: positiveInteger,
  contentType: z.literal("audio/mpeg"),
  sizeBytes: safePositiveInteger,
  durationMs: safePositiveInteger.nullable(),
  originalFilename: mp3Filename,
  playbackUrl: z.url(),
  playbackExpiresAt: timestamp,
});

export const adminLessonAudioResponseSchema = z.strictObject({
  audio: adminLessonAudioSchema.nullable(),
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
export type ChangeKind = z.infer<typeof changeKindSchema>;
export type UpsertLessonTextRequest = z.infer<
  typeof upsertLessonTextRequestSchema
>;
export type UpsertLessonSourceRequest = z.infer<
  typeof upsertLessonSourceRequestSchema
>;
export type CreateSourceRequest = z.infer<typeof createSourceRequestSchema>;
export type UpdateSourceRequest = z.infer<typeof updateSourceRequestSchema>;
export type SourceResponse = z.infer<typeof sourceResponseSchema>;
export type SourceListResponse = z.infer<typeof sourceListResponseSchema>;
export type LessonStatus = z.infer<typeof lessonStatusSchema>;
export type LessonSummary = z.infer<typeof lessonSummarySchema>;
export type LessonDetail = z.infer<typeof lessonDetailSchema>;
export type LessonListResponse = z.infer<typeof lessonListResponseSchema>;
export type MobileLessonDetail = z.infer<typeof mobileLessonDetailSchema>;
export type MobileLessonAudio = z.infer<typeof mobileLessonAudioSchema>;
export type AdminLessonAudio = z.infer<typeof adminLessonAudioSchema>;
export type AdminLessonAudioResponse = z.infer<
  typeof adminLessonAudioResponseSchema
>;
export type MobileLessonListResponse = z.infer<
  typeof mobileLessonListResponseSchema
>;
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
export type CreateUploadIntentRequest = z.infer<
  typeof createUploadIntentRequestSchema
>;
export type CompleteMediaAssetRequest = z.infer<
  typeof completeMediaAssetRequestSchema
>;
export type UploadIntentResponse = z.infer<typeof uploadIntentResponseSchema>;
export type CompleteMediaAssetResponse = z.infer<
  typeof completeMediaAssetResponseSchema
>;
