import type {
  CreateLessonRequest,
  PatchLessonRequest,
  UpsertLessonSourceRequest,
  UpsertLessonTextRequest,
} from "@ez-dk-citizen/api-contracts";
import { and, eq, inArray, ne, notExists } from "drizzle-orm";

import type { DataDatabase, DataTransaction } from "../../db/database.js";
import {
  language,
  lesson,
  lessonAudio,
  lessonSource,
  lessonText,
  mediaAsset,
  source,
} from "../../db/schema.js";
import {
  isAllowedLessonTransition,
  isEditableLesson,
  type LessonVersion,
  lockEditableDraft,
  nextUpdatedAt,
  nextVersion,
  selectHighestVersion,
  touchLesson,
} from "./lifecycle.js";

export async function createLesson(
  database: DataDatabase,
  input: CreateLessonRequest,
) {
  const [created] = await database.transaction(async (transaction) =>
    transaction
      .insert(lesson)
      .values({ chapter: input.chapter, status: "DRAFT" })
      .returning({ id: lesson.id }),
  );
  if (!created) throw new Error("Lesson insert returned no row.");
  return created.id;
}

// Deletes a Draft with its Lesson Audio, and with its Lesson Texts and Lesson Sources by cascade.
// Each Media Asset that audio used is marked DELETED once no remaining Lesson Audio uses it;
// one shared with another Lesson stays. Returns the marked ones, whose objects are to go.
// ponytail: the check takes no lock on the Media Assets, so two Drafts deleted at once that were
// the only users of one asset would both leave it READY. That cannot happen while audio is shared
// only by copying a Published or Archived Lesson, whose Lesson Audio is never deleted; lock the
// assets FOR UPDATE first if Drafts ever share audio without such a Lesson.
export async function deleteLesson(database: DataDatabase, id: number) {
  return database.transaction(async (transaction) => {
    const existing = await lockEditableDraft(transaction, id);
    if (typeof existing === "string") return existing;

    const deletedAudio = await transaction
      .delete(lessonAudio)
      .where(eq(lessonAudio.lessonId, id))
      .returning({ mediaAssetId: lessonAudio.mediaAssetId });
    await transaction.delete(lesson).where(eq(lesson.id, id));
    return transaction
      .update(mediaAsset)
      .set({ status: "DELETED" })
      .where(
        and(
          inArray(
            mediaAsset.id,
            deletedAudio.map(({ mediaAssetId }) => mediaAssetId),
          ),
          notExists(
            transaction
              .select({ id: lessonAudio.id })
              .from(lessonAudio)
              .where(eq(lessonAudio.mediaAssetId, mediaAsset.id)),
          ),
        ),
      )
      .returning({ id: mediaAsset.id, objectKey: mediaAsset.objectKey });
  });
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
        status: lesson.status,
        updatedAt: lesson.updatedAt,
      })
      .from(lesson)
      .where(eq(lesson.id, id))
      .for("update");
    if (!existing) return "lesson_not_found" as const;

    if (
      (input.chapter !== undefined || input.text !== undefined) &&
      !isEditableLesson(existing.status)
    ) {
      return "lesson_not_editable" as const;
    }
    if (
      input.status !== undefined &&
      !isAllowedLessonTransition(existing.status, input.status)
    ) {
      return "lesson_lifecycle_conflict" as const;
    }
    if (
      input.text &&
      !(await isSupportedLanguage(transaction, input.text.languageCode))
    ) {
      return "unsupported_language" as const;
    }

    const chapter = input.chapter ?? existing.chapter;
    const status = input.status ?? existing.status;
    // The version publication gives; other changes leave it as it is.
    let given: LessonVersion | undefined;

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
        ...(thaiText || input.text?.languageCode === "th"
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

      const next = nextVersion(
        await selectHighestVersion(transaction, chapter),
        input.changeKind,
      );
      if (next === "change_kind_required") return next;
      given = next;
    }

    // Every refusal comes before this point: a refusal commits, so nothing may be written yet.
    if (input.text) {
      const { languageCode, ...text } = input.text;
      await writeLessonText(transaction, id, languageCode, text);
    }
    await transaction
      .update(lesson)
      .set({
        chapter,
        ...given,
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

    if (!(await isSupportedLanguage(transaction, languageCode)))
      return "unsupported_language" as const;

    await writeLessonText(transaction, id, languageCode, input);
    await touchLesson(transaction, id, existing.updatedAt);
    return id;
  });
}

async function isSupportedLanguage(
  transaction: DataTransaction,
  languageCode: string,
) {
  const [supported] = await transaction
    .select({ code: language.code })
    .from(language)
    .where(eq(language.code, languageCode));
  return supported !== undefined;
}

async function writeLessonText(
  transaction: DataTransaction,
  lessonId: number,
  languageCode: string,
  text: UpsertLessonTextRequest,
) {
  await transaction
    .insert(lessonText)
    .values({ lessonId, languageCode, ...text })
    .onConflictDoUpdate({
      target: [lessonText.lessonId, lessonText.languageCode],
      set: text,
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
