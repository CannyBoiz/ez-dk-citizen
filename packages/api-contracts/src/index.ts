import { z } from "zod";

const positiveInteger = z.number().int().positive();
const timestamp = z.string().datetime({ offset: true });

export const livenessResponseSchema = z.strictObject({
  status: z.literal("ok"),
});

export const readinessResponseSchema = z.strictObject({
  status: z.enum(["ok", "unavailable"]),
});

export const lessonStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

export const createLessonRequestSchema = z.strictObject({
  chapter: positiveInteger,
  version: positiveInteger,
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
  title: z.string(),
  content: z.string(),
});

export const lessonSourceResponseSchema = z.strictObject({
  id: positiveInteger,
  url: z.string().url(),
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

export const problemDetailsSchema = z.strictObject({
  type: z.string().url(),
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
export type LessonStatus = z.infer<typeof lessonStatusSchema>;
export type LessonSummary = z.infer<typeof lessonSummarySchema>;
export type LessonDetail = z.infer<typeof lessonDetailSchema>;
export type LessonListResponse = z.infer<typeof lessonListResponseSchema>;
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
