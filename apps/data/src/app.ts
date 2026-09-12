import {
  createSourceRequestSchema,
  createLessonRequestSchema,
  lessonDetailSchema,
  lessonListResponseSchema,
  mobileLessonDetailSchema,
  mobileLessonListResponseSchema,
  livenessResponseSchema,
  patchLessonRequestSchema,
  readinessResponseSchema,
  sourceListResponseSchema,
  sourceResponseSchema,
  upsertLessonSourceRequestSchema,
  upsertLessonTextRequestSchema,
} from "@ez-dk-citizen/api-contracts";
import type {
  CreateLessonRequest,
  CreateSourceRequest,
  PatchLessonRequest,
  UpsertLessonSourceRequest,
  UpsertLessonTextRequest,
} from "@ez-dk-citizen/api-contracts";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { Hono } from "hono";

import { createDataDatabase } from "./db/database.js";
import {
  language,
  lesson,
  lessonSource,
  lessonText,
  source,
} from "./db/schema.js";
import {
  type DataAppEnvironment,
  installRequestLifecycle,
  isPostgresError,
  parseJsonBody,
  parsePositiveId,
  problem,
  requireBearerToken,
} from "./http.js";

type DataDatabase = ReturnType<typeof createDataDatabase>["database"];

export interface DataAppOptions {
  database?: DataDatabase;
  dataServiceToken?: string;
}

export function createDataApp(
  checkDatabaseReadiness: () => Promise<void>,
  options: DataAppOptions = {},
) {
  const app = new Hono<DataAppEnvironment>();

  installRequestLifecycle(app);
  app.onError((_error, c) => {
    return problem(
      c,
      500,
      "internal_error",
      "The request could not be completed.",
    );
  });

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
  app.post("/internal/lessons", async (c) => {
    const parsed = await parseJsonBody<CreateLessonRequest>(
      c,
      createLessonRequestSchema,
    );
    if ("response" in parsed) return parsed.response;
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
            .values({ ...parsed.value, status: "DRAFT" })
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
  });

  app.post("/internal/sources", async (c) => {
    const parsed = await parseJsonBody<CreateSourceRequest>(
      c,
      createSourceRequestSchema,
    );
    if ("response" in parsed) return parsed.response;
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
          url: parsed.value.url,
          publishedAt: parsed.value.publishedAt
            ? new Date(parsed.value.publishedAt)
            : null,
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
  });

  app.patch("/internal/lessons/:lessonId", async (c) => {
    const id = parsePositiveId(c.req.param("lessonId"));
    if (!id)
      return problem(
        c,
        422,
        "invalid_lesson_id",
        "Lesson ID must be a positive integer.",
      );
    const parsed = await parseJsonBody<PatchLessonRequest>(
      c,
      patchLessonRequestSchema,
    );
    if ("response" in parsed) return parsed.response;
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
            parsed.value.chapter !== undefined ||
            parsed.value.version !== undefined;
          if (changesStructure && existing.status !== "DRAFT") {
            return "lesson_not_editable" as const;
          }
          if (
            parsed.value.status !== undefined &&
            !isAllowedLessonTransition(existing.status, parsed.value.status)
          ) {
            return "lesson_lifecycle_conflict" as const;
          }

          const chapter = parsed.value.chapter ?? existing.chapter;
          const version = parsed.value.version ?? existing.version;
          const status = parsed.value.status ?? existing.status;
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
              updatedAt: new Date(
                Math.max(Date.now(), existing.updatedAt.getTime() + 1),
              ),
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
      if (isPostgresError(error, "23505", "lesson_one_published_per_chapter")) {
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
  });

  app.put("/internal/lessons/:lessonId/texts/:languageCode", async (c) => {
    const id = parsePositiveId(c.req.param("lessonId"));
    if (!id)
      return problem(
        c,
        422,
        "invalid_lesson_id",
        "Lesson ID must be a positive integer.",
      );
    const parsed = await parseJsonBody<UpsertLessonTextRequest>(
      c,
      upsertLessonTextRequestSchema,
    );
    if ("response" in parsed) return parsed.response;
    if (!options.database) {
      return problem(
        c,
        500,
        "internal_error",
        "The request could not be completed.",
      );
    }

    const languageCode = c.req.param("languageCode");
    const outcome = await options.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ status: lesson.status, updatedAt: lesson.updatedAt })
        .from(lesson)
        .where(eq(lesson.id, id))
        .for("update");
      if (!existing) return "lesson_not_found" as const;
      if (existing.status !== "DRAFT") return "lesson_not_editable" as const;

      const [supported] = await transaction
        .select({ code: language.code })
        .from(language)
        .where(eq(language.code, languageCode));
      if (!supported) return "unsupported_language" as const;

      await transaction
        .insert(lessonText)
        .values({ lessonId: id, languageCode, ...parsed.value })
        .onConflictDoUpdate({
          target: [lessonText.lessonId, lessonText.languageCode],
          set: parsed.value,
        });
      await transaction
        .update(lesson)
        .set({
          updatedAt: new Date(
            Math.max(Date.now(), existing.updatedAt.getTime() + 1),
          ),
        })
        .where(eq(lesson.id, id));
      return id;
    });

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
  });

  app.put("/internal/lessons/:lessonId/sources/:sourceId", async (c) => {
    const lessonId = parsePositiveId(c.req.param("lessonId"));
    if (!lessonId)
      return problem(
        c,
        422,
        "invalid_lesson_id",
        "Lesson ID must be a positive integer.",
      );
    const sourceId = parsePositiveId(c.req.param("sourceId"));
    if (!sourceId)
      return problem(
        c,
        422,
        "invalid_source_id",
        "Source ID must be a positive integer.",
      );
    const parsed = await parseJsonBody<UpsertLessonSourceRequest>(
      c,
      upsertLessonSourceRequestSchema,
    );
    if ("response" in parsed) return parsed.response;
    if (!options.database) {
      return problem(
        c,
        500,
        "internal_error",
        "The request could not be completed.",
      );
    }

    const outcome = await options.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ status: lesson.status, updatedAt: lesson.updatedAt })
        .from(lesson)
        .where(eq(lesson.id, lessonId))
        .for("update");
      if (!existing) return "lesson_not_found" as const;
      if (existing.status !== "DRAFT") return "lesson_not_editable" as const;

      const [existingSource] = await transaction
        .select({ id: source.id })
        .from(source)
        .where(eq(source.id, sourceId));
      if (!existingSource) return "source_not_found" as const;

      const locators = {
        pageFrom: parsed.value.pageFrom ?? null,
        pageTo: parsed.value.pageTo ?? null,
        sectionReference: parsed.value.sectionReference ?? null,
      };
      await transaction
        .insert(lessonSource)
        .values({ lessonId, sourceId, ...locators })
        .onConflictDoUpdate({
          target: [lessonSource.lessonId, lessonSource.sourceId],
          set: locators,
        });
      await transaction
        .update(lesson)
        .set({
          updatedAt: new Date(
            Math.max(Date.now(), existing.updatedAt.getTime() + 1),
          ),
        })
        .where(eq(lesson.id, lessonId));
      return lessonId;
    });

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
  });

  app.delete("/internal/lessons/:lessonId/sources/:sourceId", async (c) => {
    const lessonId = parsePositiveId(c.req.param("lessonId"));
    if (!lessonId)
      return problem(
        c,
        422,
        "invalid_lesson_id",
        "Lesson ID must be a positive integer.",
      );
    const sourceId = parsePositiveId(c.req.param("sourceId"));
    if (!sourceId)
      return problem(
        c,
        422,
        "invalid_source_id",
        "Source ID must be a positive integer.",
      );
    if (!options.database) {
      return problem(
        c,
        500,
        "internal_error",
        "The request could not be completed.",
      );
    }

    const outcome = await options.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ status: lesson.status, updatedAt: lesson.updatedAt })
        .from(lesson)
        .where(eq(lesson.id, lessonId))
        .for("update");
      if (!existing) return "lesson_not_found" as const;
      if (existing.status !== "DRAFT") return "lesson_not_editable" as const;

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
      await transaction
        .update(lesson)
        .set({
          updatedAt: new Date(
            Math.max(Date.now(), existing.updatedAt.getTime() + 1),
          ),
        })
        .where(eq(lesson.id, lessonId));
    });

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
  });

  app.get("/internal/lessons", async (c) => {
    if (!options.database) {
      return problem(
        c,
        500,
        "internal_error",
        "The request could not be completed.",
      );
    }

    const languageCode = c.req.query("language");
    const status = c.req.query("status");
    if (status && !["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status))
      return problem(c, 422, "validation_failed", "Status is invalid.");
    const filteredStatus = status as
      | "DRAFT"
      | "PUBLISHED"
      | "ARCHIVED"
      | undefined;
    if (languageCode) {
      const [supported] = await options.database
        .select({ code: language.code })
        .from(language)
        .where(eq(language.code, languageCode));
      if (!supported)
        return problem(c, 422, "unsupported_language", "Language is not supported.");
      const rows = await options.database
        .select({ id: lesson.id })
        .from(lesson)
        .where(eq(lesson.status, filteredStatus ?? "PUBLISHED"))
        .orderBy(asc(lesson.chapter));
      const items = (await Promise.all(rows.map(({ id }) => loadLessonDetail(options.database!, id))))
        .filter((detail): detail is NonNullable<typeof detail> => Boolean(detail))
        .flatMap((detail) => {
          const text = detail.lessonTexts.find((item) => item.languageCode === languageCode);
          return text
            ? [{ id: detail.id, chapter: detail.chapter, version: detail.version, languageCode, title: text.title }]
            : [];
        });
      return c.json(mobileLessonListResponseSchema.parse({ items }));
    }
    const rows = await options.database
      .select()
      .from(lesson)
      .orderBy(asc(lesson.chapter), desc(lesson.version));
    const items = await Promise.all(
      rows.map(async ({ id }) => {
        const detail = await loadLessonDetail(options.database!, id);
        if (!detail) throw new Error("Lesson could not be read.");
        return toSummary(detail);
      }),
    );
    return c.json(lessonListResponseSchema.parse({ items }));
  });

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

  app.get("/internal/lessons/:lessonId", async (c) => {
    const id = parsePositiveId(c.req.param("lessonId"));
    if (!id)
      return problem(
        c,
        422,
        "invalid_lesson_id",
        "Lesson ID must be a positive integer.",
      );
    if (!options.database) {
      return problem(
        c,
        500,
        "internal_error",
        "The request could not be completed.",
      );
    }

    const languageCode = c.req.query("language");
    const status = c.req.query("status");
    if (status && !["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status))
      return problem(c, 422, "validation_failed", "Status is invalid.");
    const filteredStatus = status as
      | "DRAFT"
      | "PUBLISHED"
      | "ARCHIVED"
      | undefined;
    if (languageCode) {
      const [supported] = await options.database
        .select({ code: language.code })
        .from(language)
        .where(eq(language.code, languageCode));
      if (!supported)
        return problem(c, 422, "unsupported_language", "Language is not supported.");
    }
    const detail = await loadLessonDetail(options.database, id);
    if (!detail)
      return problem(c, 404, "lesson_not_found", "Lesson was not found.");
    if (languageCode) {
      if (detail.status !== (filteredStatus ?? "PUBLISHED"))
        return problem(c, 404, "lesson_not_found", "Lesson was not found.");
      const text = detail.lessonTexts.find((item) => item.languageCode === languageCode);
      if (!text)
        return problem(c, 404, "lesson_text_not_found", "Lesson Text was not found.");
      return c.json(
        mobileLessonDetailSchema.parse({
          id: detail.id, chapter: detail.chapter, version: detail.version,
          languageCode, title: text.title, content: text.content,
          availableLanguageCodes: detail.availableLanguageCodes,
          lessonSources: detail.lessonSources,
        }),
      );
    }
    return c.json(lessonDetailSchema.parse(detail));
  });

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

function isAllowedLessonTransition(
  from: "DRAFT" | "PUBLISHED" | "ARCHIVED",
  to: "DRAFT" | "PUBLISHED" | "ARCHIVED",
) {
  return (
    (from === "DRAFT" && (to === "PUBLISHED" || to === "ARCHIVED")) ||
    (from === "PUBLISHED" && to === "ARCHIVED")
  );
}
