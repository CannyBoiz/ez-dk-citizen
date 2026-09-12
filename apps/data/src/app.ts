import {
  createLessonRequestSchema,
  lessonDetailSchema,
  lessonListResponseSchema,
  livenessResponseSchema,
  readinessResponseSchema,
  upsertLessonTextRequestSchema,
} from "@ez-dk-citizen/api-contracts";
import type {
  CreateLessonRequest,
  UpsertLessonTextRequest,
} from "@ez-dk-citizen/api-contracts";
import { asc, desc, eq } from "drizzle-orm";
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
        .where(eq(lesson.id, id));
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

  app.get("/internal/lessons", async (c) => {
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

    const detail = await loadLessonDetail(options.database, id);
    if (!detail)
      return problem(c, 404, "lesson_not_found", "Lesson was not found.");
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
