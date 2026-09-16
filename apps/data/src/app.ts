import {
  completeMediaAssetRequestSchema,
  completeMediaAssetResponseSchema,
  createSourceRequestSchema,
  createPendingMediaAssetRequestSchema,
  lessonIdParamsSchema,
  lessonReadQuerySchema,
  lessonSourceParamsSchema,
  lessonTextParamsSchema,
  createLessonRequestSchema,
  installRequestLifecycle,
  lessonDetailSchema,
  lessonDetailListResponseSchema,
  lessonListResponseSchema,
  lessonStatusSchema,
  mediaAssetIdParamsSchema,
  mediaAssetLookupResponseSchema,
  mediaAssetResponseSchema,
  livenessResponseSchema,
  patchLessonRequestSchema,
  publishedLessonDetailSchema,
  problem,
  readinessResponseSchema,
  requireBearerToken,
  validateJson,
  validateRequest,
  sourceListResponseSchema,
  sourceResponseSchema,
  upsertLessonSourceRequestSchema,
  upsertLessonTextRequestSchema,
} from "@ez-dk-citizen/api-contracts";
import type {
  CompleteMediaAssetRequest,
  CreateLessonRequest,
  CreateSourceRequest,
  CreatePendingMediaAssetRequest,
  LessonStatus,
  PatchLessonRequest,
  RequestIdEnvironment,
  UpsertLessonSourceRequest,
  UpsertLessonTextRequest,
} from "@ez-dk-citizen/api-contracts";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";

import { createDataDatabase } from "./db/database.js";
import {
  language,
  lesson,
  lessonAudio,
  mediaAsset,
  lessonSource,
  lessonText,
  source,
} from "./db/schema.js";
type DataDatabase = ReturnType<typeof createDataDatabase>["database"];
type DataTransaction = Parameters<
  Parameters<DataDatabase["transaction"]>[0]
>[0];

export interface DataAppOptions {
  database?: DataDatabase;
  dataServiceToken?: string;
}

export function createDataApp(
  checkDatabaseReadiness: () => Promise<void>,
  options: DataAppOptions = {},
) {
  const app = new Hono<RequestIdEnvironment>();

  installRequestLifecycle(app);
  app.onError((error, c) => {
    if (error instanceof HTTPException && error.status === 400) {
      return problem(
        c,
        400,
        "malformed_json",
        "Request body is not valid JSON.",
      );
    }
    return problem(
      c,
      500,
      "internal_error",
      "The request could not be completed.",
    );
  });
  app.notFound((c) =>
    problem(c, 404, "not_found", "The requested resource was not found."),
  );

  app.get("/", (c) => c.text("Hello Hono!"));
  app.get("/health", (c) =>
    c.json(livenessResponseSchema.parse({ status: "ok" })),
  );
  app.get("/ready", async (c) => {
    try {
      await checkDatabaseReadiness();
      return c.json(readinessResponseSchema.parse({ status: "ok" }));
    } catch {
      return c.json(
        readinessResponseSchema.parse({ status: "unavailable" }),
        503,
      );
    }
  });

  app.use("/internal/*", requireBearerToken(options.dataServiceToken));
  app.use(
    "/internal/*",
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) =>
        problem(c, 422, "body_too_large", "Request body exceeds 1 MiB."),
    }),
  );
  app.post(
    "/internal/media-assets",
    validateJson(createPendingMediaAssetRequestSchema),
    async (c) => {
      const input = c.req.valid("json") as CreatePendingMediaAssetRequest;
      if (!options.database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const [supported] = await options.database
        .select({ code: language.code })
        .from(language)
        .where(eq(language.code, input.languageCode));
      if (!supported) {
        return problem(
          c,
          422,
          "unsupported_language",
          "Language is not supported.",
        );
      }

      const [created] = await options.database
        .insert(mediaAsset)
        .values({
          storageProvider: input.storageProvider,
          storageContainer: input.storageContainer,
          objectKey: input.objectKey,
          originalFilename: input.originalFilename,
          contentType: input.contentType,
          sizeBytes: BigInt(input.sizeBytes),
          status: "PENDING",
          durationMs: null,
          uploadedAt: null,
        })
        .returning();
      if (!created) throw new Error("Media Asset insert returned no row.");
      return c.json(mediaAssetResponseSchema.parse(toMediaAsset(created)), 201);
    },
  );

  app.get(
    "/internal/media-assets/:mediaAssetId",
    validateRequest("param", mediaAssetIdParamsSchema),
    async (c) => {
      const { mediaAssetId } = c.req.valid("param") as {
        mediaAssetId: number;
      };
      if (!options.database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }
      const [asset] = await options.database
        .select()
        .from(mediaAsset)
        .where(eq(mediaAsset.id, mediaAssetId));
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
    "/internal/media-assets/:mediaAssetId/fail",
    validateRequest("param", mediaAssetIdParamsSchema),
    async (c) => {
      const { mediaAssetId } = c.req.valid("param") as {
        mediaAssetId: number;
      };
      if (!options.database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const outcome = await options.database.transaction(
        async (transaction) => {
          const [asset] = await transaction
            .select({ status: mediaAsset.status })
            .from(mediaAsset)
            .where(eq(mediaAsset.id, mediaAssetId))
            .for("update");
          if (!asset) return "media_asset_not_found" as const;
          if (asset.status !== "PENDING")
            return "media_asset_not_pending" as const;
          await transaction
            .update(mediaAsset)
            .set({ status: "FAILED" })
            .where(eq(mediaAsset.id, mediaAssetId));
          return "failed" as const;
        },
      );

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
    "/internal/media-assets/:mediaAssetId/complete",
    validateRequest("param", mediaAssetIdParamsSchema),
    validateJson(completeMediaAssetRequestSchema),
    async (c) => {
      const { mediaAssetId } = c.req.valid("param") as {
        mediaAssetId: number;
      };
      const input = c.req.valid("json") as CompleteMediaAssetRequest;
      if (!options.database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const outcome = await options.database.transaction(
        async (transaction) => {
          const [asset] = await transaction
            .select()
            .from(mediaAsset)
            .where(eq(mediaAsset.id, mediaAssetId))
            .for("update");
          if (!asset) return "media_asset_not_found" as const;
          if (asset.status === "READY") {
            const [audio] = await transaction
              .select()
              .from(lessonAudio)
              .where(eq(lessonAudio.mediaAssetId, asset.id))
              .for("update");
            if (!audio)
              throw new Error("Ready Media Asset has no Lesson Audio.");
            if (
              audio.lessonId === input.lessonId &&
              audio.languageCode === input.languageCode
            ) {
              return { readyAsset: asset, audio };
            }
            return "media_asset_rebind_conflict" as const;
          }
          if (asset.status === "FAILED") return "media_asset_failed" as const;
          if (asset.status !== "PENDING")
            return "media_asset_not_pending" as const;

          const [supported] = await transaction
            .select({ code: language.code })
            .from(language)
            .where(eq(language.code, input.languageCode));
          if (!supported) return "unsupported_language" as const;

          const [target] = await transaction
            .select({ status: lesson.status, updatedAt: lesson.updatedAt })
            .from(lesson)
            .where(eq(lesson.id, input.lessonId))
            .for("update");
          if (!target) return "lesson_not_found" as const;
          if (target.status === "ARCHIVED") return "lesson_archived" as const;

          const [text] = await transaction
            .select({ lessonId: lessonText.lessonId })
            .from(lessonText)
            .where(
              and(
                eq(lessonText.lessonId, input.lessonId),
                eq(lessonText.languageCode, input.languageCode),
              ),
            );
          if (!text) return "lesson_text_not_found" as const;

          const now = new Date();
          const [latestAudio] = await transaction
            .select({ audioVersion: lessonAudio.audioVersion })
            .from(lessonAudio)
            .where(
              and(
                eq(lessonAudio.lessonId, input.lessonId),
                eq(lessonAudio.languageCode, input.languageCode),
              ),
            )
            .orderBy(desc(lessonAudio.audioVersion))
            .limit(1);
          await transaction
            .update(lessonAudio)
            .set({ isCurrent: false })
            .where(
              and(
                eq(lessonAudio.lessonId, input.lessonId),
                eq(lessonAudio.languageCode, input.languageCode),
                eq(lessonAudio.isCurrent, true),
              ),
            );
          const [readyAsset] = await transaction
            .update(mediaAsset)
            .set({ status: "READY", uploadedAt: now })
            .where(eq(mediaAsset.id, asset.id))
            .returning();
          if (!readyAsset)
            throw new Error("Media Asset update returned no row.");
          const [audio] = await transaction
            .insert(lessonAudio)
            .values({
              lessonId: input.lessonId,
              languageCode: input.languageCode,
              mediaAssetId: asset.id,
              audioVersion: (latestAudio?.audioVersion ?? 0) + 1,
              isCurrent: true,
            })
            .returning();
          if (!audio) throw new Error("Lesson Audio insert returned no row.");
          await touchLesson(transaction, input.lessonId, target.updatedAt);
          return { readyAsset, audio };
        },
      );

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

  app.post(
    "/internal/lessons",
    validateJson(createLessonRequestSchema),
    async (c) => {
      const input = c.req.valid("json") as CreateLessonRequest;
      if (!options.database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      try {
        const [created] = await options.database.transaction(
          async (transaction) =>
            transaction
              .insert(lesson)
              .values({ ...input, status: "DRAFT" })
              .returning({ id: lesson.id }),
        );
        if (!created) throw new Error("Lesson insert returned no row.");
        const detail = await loadLessonDetail(options.database, created.id);
        if (!detail) throw new Error("Created Lesson could not be read.");
        return c.json(lessonDetailSchema.parse(detail), 201);
      } catch (error) {
        if (isPostgresError(error, "23505")) {
          return problem(
            c,
            409,
            "lesson_version_conflict",
            "A Lesson with this chapter and version already exists.",
          );
        }
        throw error;
      }
    },
  );

  app.post(
    "/internal/sources",
    validateJson(createSourceRequestSchema),
    async (c) => {
      const input = c.req.valid("json") as CreateSourceRequest;
      if (!options.database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }
      try {
        const [created] = await options.database
          .insert(source)
          .values({
            url: input.url,
            publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
          })
          .returning();
        if (!created) throw new Error("Source insert returned no row.");
        return c.json(sourceResponseSchema.parse(toSource(created)), 201);
      } catch (error) {
        if (isPostgresError(error, "23505")) {
          return problem(
            c,
            409,
            "source_url_conflict",
            "A Source with this URL already exists.",
          );
        }
        throw error;
      }
    },
  );

  app.patch(
    "/internal/lessons/:lessonId",
    validateRequest("param", lessonIdParamsSchema),
    validateJson(patchLessonRequestSchema),
    async (c) => {
      const { lessonId: id } = c.req.valid("param") as { lessonId: number };
      const input = c.req.valid("json") as PatchLessonRequest;
      if (!options.database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      try {
        const outcome = await options.database.transaction(
          async (transaction) => {
            const [existing] = await transaction
              .select({
                chapter: lesson.chapter,
                version: lesson.version,
                status: lesson.status,
                updatedAt: lesson.updatedAt,
              })
              .from(lesson)
              .where(eq(lesson.id, id))
              .for("update");
            if (!existing) return "lesson_not_found" as const;

            const changesStructure =
              input.chapter !== undefined || input.version !== undefined;
            if (changesStructure && !isEditableLesson(existing.status)) {
              return "lesson_not_editable" as const;
            }
            if (
              input.status !== undefined &&
              !isAllowedLessonTransition(existing.status, input.status)
            ) {
              return "lesson_lifecycle_conflict" as const;
            }

            const chapter = input.chapter ?? existing.chapter;
            const version = input.version ?? existing.version;
            const status = input.status ?? existing.status;
            const [identityConflict] = await transaction
              .select({ id: lesson.id })
              .from(lesson)
              .where(
                and(
                  eq(lesson.chapter, chapter),
                  eq(lesson.version, version),
                  ne(lesson.id, id),
                ),
              );
            if (identityConflict) return "lesson_version_conflict" as const;

            if (status === "PUBLISHED") {
              const [published] = await transaction
                .select({ id: lesson.id })
                .from(lesson)
                .where(
                  and(
                    eq(lesson.chapter, chapter),
                    eq(lesson.status, "PUBLISHED"),
                    ne(lesson.id, id),
                  ),
                );
              if (published) return "published_lesson_conflict" as const;
            }

            await transaction
              .update(lesson)
              .set({
                chapter,
                version,
                status,
                updatedAt: nextUpdatedAt(existing.updatedAt),
              })
              .where(eq(lesson.id, id));
            return id;
          },
        );

        if (outcome === "lesson_not_found") {
          return problem(c, 404, outcome, "Lesson was not found.");
        }
        if (outcome === "lesson_not_editable") {
          return problem(c, 409, outcome, "Only Draft Lessons can be edited.");
        }
        if (outcome === "lesson_lifecycle_conflict") {
          return problem(
            c,
            409,
            outcome,
            "Lesson status transition is not allowed.",
          );
        }
        if (outcome === "lesson_version_conflict") {
          return problem(
            c,
            409,
            outcome,
            "A Lesson with this chapter and version already exists.",
          );
        }
        if (outcome === "published_lesson_conflict") {
          return problem(
            c,
            409,
            outcome,
            "This chapter already has a Published Lesson.",
          );
        }

        const detail = await loadLessonDetail(options.database, outcome);
        if (!detail) throw new Error("Updated Lesson could not be read.");
        return c.json(lessonDetailSchema.parse(detail));
      } catch (error) {
        if (
          isPostgresError(error, "23505", "lesson_one_published_per_chapter")
        ) {
          return problem(
            c,
            409,
            "published_lesson_conflict",
            "This chapter already has a Published Lesson.",
          );
        }
        if (isPostgresError(error, "23505")) {
          return problem(
            c,
            409,
            "lesson_version_conflict",
            "A Lesson with this chapter and version already exists.",
          );
        }
        throw error;
      }
    },
  );

  app.put(
    "/internal/lessons/:lessonId/texts/:languageCode",
    validateRequest("param", lessonTextParamsSchema),
    validateJson(upsertLessonTextRequestSchema),
    async (c) => {
      const { lessonId: id, languageCode } = c.req.valid("param") as {
        lessonId: number;
        languageCode: string;
      };
      const input = c.req.valid("json") as UpsertLessonTextRequest;
      if (!options.database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const outcome = await options.database.transaction(
        async (transaction) => {
          const existing = await lockEditableDraft(transaction, id);
          if (typeof existing === "string") return existing;

          const [supported] = await transaction
            .select({ code: language.code })
            .from(language)
            .where(eq(language.code, languageCode));
          if (!supported) return "unsupported_language" as const;

          await transaction
            .insert(lessonText)
            .values({ lessonId: id, languageCode, ...input })
            .onConflictDoUpdate({
              target: [lessonText.lessonId, lessonText.languageCode],
              set: input,
            });
          await touchLesson(transaction, id, existing.updatedAt);
          return id;
        },
      );

      if (outcome === "lesson_not_found") {
        return problem(c, 404, outcome, "Lesson was not found.");
      }
      if (outcome === "lesson_not_editable") {
        return problem(c, 409, outcome, "Only Draft Lessons can be edited.");
      }
      if (outcome === "unsupported_language") {
        return problem(c, 422, outcome, "Language is not supported.");
      }

      const detail = await loadLessonDetail(options.database, outcome);
      if (!detail) throw new Error("Updated Lesson could not be read.");
      return c.json(lessonDetailSchema.parse(detail));
    },
  );

  app.put(
    "/internal/lessons/:lessonId/sources/:sourceId",
    validateRequest("param", lessonSourceParamsSchema),
    validateJson(upsertLessonSourceRequestSchema),
    async (c) => {
      const { lessonId, sourceId } = c.req.valid("param") as {
        lessonId: number;
        sourceId: number;
      };
      const input = c.req.valid("json") as UpsertLessonSourceRequest;
      if (!options.database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const outcome = await options.database.transaction(
        async (transaction) => {
          const existing = await lockEditableDraft(transaction, lessonId);
          if (typeof existing === "string") return existing;

          const [existingSource] = await transaction
            .select({ id: source.id })
            .from(source)
            .where(eq(source.id, sourceId));
          if (!existingSource) return "source_not_found" as const;

          const locators = {
            pageFrom: input.pageFrom ?? null,
            pageTo: input.pageTo ?? null,
            sectionReference: input.sectionReference ?? null,
          };
          await transaction
            .insert(lessonSource)
            .values({ lessonId, sourceId, ...locators })
            .onConflictDoUpdate({
              target: [lessonSource.lessonId, lessonSource.sourceId],
              set: locators,
            });
          await touchLesson(transaction, lessonId, existing.updatedAt);
          return lessonId;
        },
      );

      if (outcome === "lesson_not_found") {
        return problem(c, 404, outcome, "Lesson was not found.");
      }
      if (outcome === "source_not_found") {
        return problem(c, 404, outcome, "Source was not found.");
      }
      if (outcome === "lesson_not_editable") {
        return problem(c, 409, outcome, "Only Draft Lessons can be edited.");
      }

      const detail = await loadLessonDetail(options.database, outcome);
      if (!detail) throw new Error("Updated Lesson could not be read.");
      return c.json(lessonDetailSchema.parse(detail));
    },
  );

  app.delete(
    "/internal/lessons/:lessonId/sources/:sourceId",
    validateRequest("param", lessonSourceParamsSchema),
    async (c) => {
      const { lessonId, sourceId } = c.req.valid("param") as {
        lessonId: number;
        sourceId: number;
      };
      if (!options.database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const outcome = await options.database.transaction(
        async (transaction) => {
          const existing = await lockEditableDraft(transaction, lessonId);
          if (typeof existing === "string") return existing;

          const [existingSource] = await transaction
            .select({ id: source.id })
            .from(source)
            .where(eq(source.id, sourceId));
          if (!existingSource) return "source_not_found" as const;

          const deleted = await transaction
            .delete(lessonSource)
            .where(
              and(
                eq(lessonSource.lessonId, lessonId),
                eq(lessonSource.sourceId, sourceId),
              ),
            )
            .returning({ lessonId: lessonSource.lessonId });
          if (!deleted.length) return;
          await touchLesson(transaction, lessonId, existing.updatedAt);
        },
      );

      if (outcome === "lesson_not_found") {
        return problem(c, 404, outcome, "Lesson was not found.");
      }
      if (outcome === "source_not_found") {
        return problem(c, 404, outcome, "Source was not found.");
      }
      if (outcome === "lesson_not_editable") {
        return problem(c, 409, outcome, "Only Draft Lessons can be edited.");
      }
      return c.body(null, 204);
    },
  );

  app.get(
    "/internal/lessons",
    validateRequest("query", lessonReadQuerySchema),
    async (c) => {
      if (!options.database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const { language: languageCode, status: filteredStatus } = c.req.valid(
        "query",
      ) as { language?: string; status?: LessonStatus };
      if (languageCode !== undefined) {
        const [supported] = await options.database
          .select({ code: language.code })
          .from(language)
          .where(eq(language.code, languageCode));
        if (!supported)
          return problem(
            c,
            422,
            "unsupported_language",
            "Language is not supported.",
          );
        const rows = await options.database
          .select({ id: lesson.id })
          .from(lesson)
          .where(filteredStatus ? eq(lesson.status, filteredStatus) : undefined)
          .orderBy(asc(lesson.chapter), desc(lesson.version));
        const items = (
          await Promise.all(
            rows.map(({ id }) => loadLessonDetail(options.database!, id)),
          )
        )
          .filter((detail): detail is NonNullable<typeof detail> =>
            Boolean(detail),
          )
          .filter((detail) =>
            detail.lessonTexts.some(
              (item) => item.languageCode === languageCode,
            ),
          );
        return c.json(lessonDetailListResponseSchema.parse({ items }));
      }
      const rows = await options.database
        .select()
        .from(lesson)
        .where(filteredStatus ? eq(lesson.status, filteredStatus) : undefined)
        .orderBy(asc(lesson.chapter), desc(lesson.version));
      const items = await Promise.all(
        rows.map(async ({ id }) => {
          const detail = await loadLessonDetail(options.database!, id);
          if (!detail) throw new Error("Lesson could not be read.");
          return toSummary(detail);
        }),
      );
      return c.json(lessonListResponseSchema.parse({ items }));
    },
  );

  app.get("/internal/sources", async (c) => {
    if (!options.database) {
      return problem(
        c,
        500,
        "internal_error",
        "The request could not be completed.",
      );
    }
    const rows = await options.database
      .select()
      .from(source)
      .orderBy(asc(source.id));
    return c.json(
      sourceListResponseSchema.parse({ items: rows.map(toSource) }),
    );
  });

  app.get(
    "/internal/lessons/:lessonId",
    validateRequest("param", lessonIdParamsSchema),
    validateRequest("query", lessonReadQuerySchema),
    async (c) => {
      const { lessonId: id } = c.req.valid("param") as { lessonId: number };
      if (!options.database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const { language: languageCode, status: filteredStatus } = c.req.valid(
        "query",
      ) as { language?: string; status?: LessonStatus };
      if (languageCode !== undefined) {
        const [supported] = await options.database
          .select({ code: language.code })
          .from(language)
          .where(eq(language.code, languageCode));
        if (!supported)
          return problem(
            c,
            422,
            "unsupported_language",
            "Language is not supported.",
          );
      }
      const detail = await loadLessonDetail(options.database, id);
      if (!detail)
        return problem(c, 404, "lesson_not_found", "Lesson was not found.");
      if (filteredStatus && detail.status !== filteredStatus)
        return problem(c, 404, "lesson_not_found", "Lesson was not found.");
      if (languageCode) {
        const text = detail.lessonTexts.find(
          (item) => item.languageCode === languageCode,
        );
        if (!text)
          return problem(
            c,
            404,
            "lesson_text_not_found",
            "Lesson Text was not found.",
          );
      }
      if (filteredStatus === "PUBLISHED" && languageCode) {
        const [currentAudio] = await options.database
          .select({
            mediaAssetId: lessonAudio.mediaAssetId,
            audioVersion: lessonAudio.audioVersion,
            objectKey: mediaAsset.objectKey,
            contentType: mediaAsset.contentType,
            sizeBytes: mediaAsset.sizeBytes,
            durationMs: mediaAsset.durationMs,
          })
          .from(lessonAudio)
          .innerJoin(mediaAsset, eq(mediaAsset.id, lessonAudio.mediaAssetId))
          .where(
            and(
              eq(lessonAudio.lessonId, id),
              eq(lessonAudio.languageCode, languageCode),
              eq(lessonAudio.isCurrent, true),
              eq(mediaAsset.status, "READY"),
            ),
          );
        return c.json(
          publishedLessonDetailSchema.parse({
            ...detail,
            currentAudio: currentAudio
              ? {
                  ...currentAudio,
                  sizeBytes: Number(currentAudio.sizeBytes),
                  durationMs:
                    currentAudio.durationMs === null
                      ? null
                      : Number(currentAudio.durationMs),
                }
              : null,
          }),
        );
      }
      return c.json(lessonDetailSchema.parse(detail));
    },
  );

  return app;
}

async function loadLessonDetail(database: DataDatabase, id: number) {
  const [row] = await database.select().from(lesson).where(eq(lesson.id, id));
  if (!row) return undefined;

  const [texts, sources] = await Promise.all([
    database
      .select({
        languageCode: lessonText.languageCode,
        title: lessonText.title,
        content: lessonText.content,
      })
      .from(lessonText)
      .where(eq(lessonText.lessonId, id))
      .orderBy(asc(lessonText.languageCode)),
    database
      .select({
        id: source.id,
        url: source.url,
        publishedAt: source.publishedAt,
        pageFrom: lessonSource.pageFrom,
        pageTo: lessonSource.pageTo,
        sectionReference: lessonSource.sectionReference,
      })
      .from(lessonSource)
      .innerJoin(source, eq(source.id, lessonSource.sourceId))
      .where(eq(lessonSource.lessonId, id))
      .orderBy(asc(source.id)),
  ]);

  return {
    id: row.id,
    chapter: row.chapter,
    version: row.version,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    availableLanguageCodes: texts.map(({ languageCode }) => languageCode),
    lessonTexts: texts,
    lessonSources: sources.map((item) => ({
      ...item,
      publishedAt: item.publishedAt?.toISOString() ?? null,
    })),
  };
}

function toSummary(
  detail: NonNullable<Awaited<ReturnType<typeof loadLessonDetail>>>,
) {
  const {
    lessonTexts: _lessonTexts,
    lessonSources: _lessonSources,
    ...summary
  } = detail;
  return summary;
}

function toSource(row: { id: number; url: string; publishedAt: Date | null }) {
  return {
    id: row.id,
    url: row.url,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

function toMediaAsset(row: {
  id: number;
  storageProvider: string;
  storageContainer: string;
  objectKey: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: bigint;
  durationMs: bigint | null;
  status: "PENDING" | "READY" | "FAILED" | "DELETED";
  createdAt: Date;
  uploadedAt: Date | null;
}) {
  return {
    id: row.id,
    storageProvider: row.storageProvider,
    storageContainer: row.storageContainer,
    objectKey: row.objectKey,
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    sizeBytes: toSafeNumber(row.sizeBytes),
    durationMs: row.durationMs === null ? null : toSafeNumber(row.durationMs),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    uploadedAt: row.uploadedAt?.toISOString() ?? null,
  };
}

function toCompletedMediaAsset(row: {
  id: number;
  contentType: string;
  sizeBytes: bigint;
  durationMs: bigint | null;
  status: "PENDING" | "READY" | "FAILED" | "DELETED";
  uploadedAt: Date | null;
}) {
  return {
    id: row.id,
    status: row.status,
    contentType: row.contentType,
    sizeBytes: toSafeNumber(row.sizeBytes),
    durationMs: row.durationMs === null ? null : toSafeNumber(row.durationMs),
    uploadedAt: row.uploadedAt?.toISOString() ?? null,
  };
}

function toLessonAudio(row: {
  id: number;
  lessonId: number;
  languageCode: string;
  audioVersion: number;
  isCurrent: boolean;
  createdAt: Date;
}) {
  return {
    id: row.id,
    lessonId: row.lessonId,
    languageCode: row.languageCode,
    audioVersion: row.audioVersion,
    isCurrent: row.isCurrent,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSafeNumber(value: bigint) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error("Database value is not safe for JSON.");
  }
  return number;
}

function isAllowedLessonTransition(from: LessonStatus, to: LessonStatus) {
  return (
    (from === "DRAFT" && (to === "PUBLISHED" || to === "ARCHIVED")) ||
    (from === "PUBLISHED" && to === "ARCHIVED")
  );
}

function isPostgresError(
  error: unknown,
  code: string,
  constraint?: string,
): boolean {
  let candidate = error;
  while (candidate && typeof candidate === "object") {
    if (
      "code" in candidate &&
      candidate.code === code &&
      (!constraint ||
        ("constraint" in candidate && candidate.constraint === constraint))
    ) {
      return true;
    }
    candidate = "cause" in candidate ? candidate.cause : undefined;
  }
  return false;
}

function isEditableLesson(status: LessonStatus) {
  return status === "DRAFT";
}

async function lockEditableDraft(transaction: DataTransaction, id: number) {
  const [existing] = await transaction
    .select({ status: lesson.status, updatedAt: lesson.updatedAt })
    .from(lesson)
    .where(eq(lesson.id, id))
    .for("update");
  if (!existing) return "lesson_not_found" as const;
  if (!isEditableLesson(existing.status)) return "lesson_not_editable" as const;
  return existing;
}

async function touchLesson(
  transaction: DataTransaction,
  id: number,
  updatedAt: Date,
) {
  await transaction
    .update(lesson)
    .set({ updatedAt: nextUpdatedAt(updatedAt) })
    .where(eq(lesson.id, id));
}

function nextUpdatedAt(updatedAt: Date) {
  return new Date(Math.max(Date.now(), updatedAt.getTime() + 1));
}
