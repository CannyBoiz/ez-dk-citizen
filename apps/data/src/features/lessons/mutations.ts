import type {
  CreateLessonRequest,
  PatchLessonRequest,
  UpsertLessonSourceRequest,
  UpsertLessonTextRequest,
} from "@ez-dk-citizen/api-contracts";
import { and, eq, ne } from "drizzle-orm";

import type { DataDatabase } from "../../db/database.js";
import {
  language,
  lesson,
  lessonSource,
  lessonText,
  source,
} from "../../db/schema.js";
import {
  isAllowedLessonTransition,
  isEditableLesson,
  lockEditableDraft,
  nextUpdatedAt,
  touchLesson,
} from "./lifecycle.js";

export async function createLesson(
  database: DataDatabase,
  input: CreateLessonRequest,
) {
  const [created] = await database.transaction(async (transaction) =>
    transaction
      .insert(lesson)
      .values({ ...input, status: "DRAFT" })
      .returning({ id: lesson.id }),
  );
  if (!created) throw new Error("Lesson insert returned no row.");
  return created.id;
}

export async function patchLesson(
  database: DataDatabase,
  id: number,
  input: PatchLessonRequest,
) {
  return database.transaction(async (transaction) => {
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

      const [thaiText] = await transaction
        .select({ lessonId: lessonText.lessonId })
        .from(lessonText)
        .where(
          and(eq(lessonText.lessonId, id), eq(lessonText.languageCode, "th")),
        );
      const [attachedSource] = await transaction
        .select({ lessonId: lessonSource.lessonId })
        .from(lessonSource)
        .where(eq(lessonSource.lessonId, id))
        .limit(1);
      const missing = [
        ...(thaiText
          ? []
          : [
              {
                path: ["lessonTexts", "th"],
                message: "A Thai Lesson Text is required.",
              },
            ]),
        ...(attachedSource
          ? []
          : [
              {
                path: ["lessonSources"],
                message: "At least one Lesson Source is required.",
              },
            ]),
      ];
      if (missing.length) return { missing };
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
  });
}

export async function upsertLessonText(
  database: DataDatabase,
  id: number,
  languageCode: string,
  input: UpsertLessonTextRequest,
) {
  return database.transaction(async (transaction) => {
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
  });
}

export async function upsertLessonSource(
  database: DataDatabase,
  lessonId: number,
  sourceId: number,
  input: UpsertLessonSourceRequest,
) {
  return database.transaction(async (transaction) => {
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
  });
}

export async function deleteLessonSource(
  database: DataDatabase,
  lessonId: number,
  sourceId: number,
) {
  return database.transaction(async (transaction) => {
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
  });
}
