import { isDeepStrictEqual } from "node:util";
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
import { fail, ok } from "../../outcome.js";
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
  return database.transaction(async (transaction) =>
    "chapter" in input
      ? ok(await insertDraft(transaction, input.chapter))
      : copyLesson(transaction, input.copyFromLessonId),
  );
}

async function insertDraft(transaction: DataTransaction, chapter: number) {
  const [created] = await transaction
    .insert(lesson)
    .values({ chapter, status: "DRAFT" })
    .returning({ id: lesson.id });
  if (!created) throw new Error("Lesson insert returned no row.");
  return created.id;
}

// A new version: a Draft of the original's chapter with its Lesson Texts, its Lesson Sources and
// their references, and each Language's current READY audio as audio version 1 on the same
// Media Asset (ADR-0008); audio history stays behind. Only Published and Archived Lessons are
// copied, as deleteLesson relies on: their Lesson Audio is never deleted.
async function copyLesson(transaction: DataTransaction, originalId: number) {
  const [original] = await transaction
    .select({ chapter: lesson.chapter, status: lesson.status })
    .from(lesson)
    .where(eq(lesson.id, originalId));
  if (!original) return fail("lesson_not_found");
  if (original.status === "DRAFT") return fail("lesson_not_copyable");

  const id = await insertDraft(transaction, original.chapter);
  const { texts, citations } = await readTextsAndCitations(
    transaction,
    originalId,
  );
  const currentAudio = await transaction
    .select({
      languageCode: lessonAudio.languageCode,
      mediaAssetId: lessonAudio.mediaAssetId,
    })
    .from(lessonAudio)
    .innerJoin(mediaAsset, eq(mediaAsset.id, lessonAudio.mediaAssetId))
    .where(
      and(
        eq(lessonAudio.lessonId, originalId),
        eq(lessonAudio.isCurrent, true),
        eq(mediaAsset.status, "READY"),
      ),
    );
  // The audio follows the texts, whose Lesson Text it requires.
  if (texts.length)
    await transaction
      .insert(lessonText)
      .values(texts.map((text) => ({ lessonId: id, ...text })));
  if (citations.length)
    await transaction
      .insert(lessonSource)
      .values(citations.map((citation) => ({ lessonId: id, ...citation })));
  if (currentAudio.length)
    await transaction.insert(lessonAudio).values(
      currentAudio.map((audio) => ({
        lessonId: id,
        ...audio,
        audioVersion: 1,
        isCurrent: true,
      })),
    );
  return ok(id);
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
    if (!existing.ok) return existing;

    const deletedAudio = await transaction
      .delete(lessonAudio)
      .where(eq(lessonAudio.lessonId, id))
      .returning({ mediaAssetId: lessonAudio.mediaAssetId });
    await transaction.delete(lesson).where(eq(lesson.id, id));
    const deletedAssets = await transaction
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
    return ok(deletedAssets);
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
    if (!existing) return fail("lesson_not_found");

    if (
      (input.chapter !== undefined || input.text !== undefined) &&
      !isEditableLesson(existing.status)
    ) {
      return fail("lesson_not_editable");
    }
    if (
      input.status !== undefined &&
      !isAllowedLessonTransition(existing.status, input.status)
    ) {
      return fail("lesson_lifecycle_conflict");
    }
    if (
      input.text &&
      !(await isSupportedLanguage(transaction, input.text.languageCode))
    ) {
      return fail("unsupported_language");
    }

    const chapter = input.chapter ?? existing.chapter;
    const status = input.status ?? existing.status;
    // The version publication gives; other changes leave it as it is.
    let given: LessonVersion | undefined;
    // The chapter's Published Lesson, which a replacement archives.
    let replaced: { id: number; updatedAt: Date } | undefined;

    if (status === "PUBLISHED") {
      // Locked, so concurrent replacements of one Lesson take turns, and the later one finds
      // it archived.
      [replaced] = await transaction
        .select({ id: lesson.id, updatedAt: lesson.updatedAt })
        .from(lesson)
        .where(
          and(
            eq(lesson.chapter, chapter),
            eq(lesson.status, "PUBLISHED"),
            ne(lesson.id, id),
          ),
        )
        .for("update");
      // The admin names the Published Lesson it expects to replace, so a stale page never
      // archives another one.
      if (replaced?.id !== input.replacesLessonId)
        return fail("published_lesson_conflict");

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
      if (missing.length)
        return { ...fail("lesson_publication_incomplete"), missing };

      if (
        replaced &&
        (await isUnchanged(transaction, id, replaced.id, input.text))
      )
        return fail("lesson_unchanged");

      const next = nextVersion(
        await selectHighestVersion(transaction, chapter),
        input.changeKind,
      );
      if (!next.ok) return next;
      given = next.value;
    }

    // Every refusal comes before this point: a refusal commits, so nothing may be written yet.
    if (input.text) {
      const { languageCode, ...text } = input.text;
      await writeLessonText(transaction, id, languageCode, text);
    }
    if (replaced) {
      await transaction
        .update(lesson)
        .set({
          status: "ARCHIVED",
          updatedAt: nextUpdatedAt(replaced.updatedAt),
        })
        .where(eq(lesson.id, replaced.id));
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
    return ok(id);
  });
}

// A Lesson's Lesson Texts, and its Lesson Sources with their references, in a stable order:
// what a new version copies, and what a replacement must change.
async function readTextsAndCitations(
  transaction: DataTransaction,
  lessonId: number,
) {
  const texts = await transaction
    .select({
      languageCode: lessonText.languageCode,
      title: lessonText.title,
      content: lessonText.content,
    })
    .from(lessonText)
    .where(eq(lessonText.lessonId, lessonId))
    .orderBy(lessonText.languageCode);
  const citations = await transaction
    .select({
      sourceId: lessonSource.sourceId,
      pageFrom: lessonSource.pageFrom,
      pageTo: lessonSource.pageTo,
      sectionReference: lessonSource.sectionReference,
    })
    .from(lessonSource)
    .where(eq(lessonSource.lessonId, lessonId))
    .orderBy(lessonSource.sourceId);
  return { texts, citations };
}

// Whether a Draft, with `text` saved over its Language's Lesson Text, has the same Lesson Texts
// and Lesson Sources as the Published Lesson it would replace. Audio is left out, since an
// audio-only change goes straight onto the Published Lesson.
async function isUnchanged(
  transaction: DataTransaction,
  draftId: number,
  publishedId: number,
  text?: PatchLessonRequest["text"],
) {
  const draft = await readTextsAndCitations(transaction, draftId);
  const published = await readTextsAndCitations(transaction, publishedId);
  const byLanguage = (texts: typeof draft.texts) =>
    new Map(texts.map((saved) => [saved.languageCode, saved]));
  const draftTexts = byLanguage(draft.texts);
  if (text) {
    const { languageCode, title, content } = text;
    draftTexts.set(languageCode, { languageCode, title, content });
  }
  return isDeepStrictEqual(
    [draftTexts, draft.citations],
    [byLanguage(published.texts), published.citations],
  );
}

export async function upsertLessonText(
  database: DataDatabase,
  id: number,
  languageCode: string,
  input: UpsertLessonTextRequest,
) {
  return database.transaction(async (transaction) => {
    const existing = await lockEditableDraft(transaction, id);
    if (!existing.ok) return existing;

    if (!(await isSupportedLanguage(transaction, languageCode)))
      return fail("unsupported_language");

    await writeLessonText(transaction, id, languageCode, input);
    await touchLesson(transaction, id, existing.value.updatedAt);
    return ok(id);
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
    if (!existing.ok) return existing;

    const [existingSource] = await transaction
      .select({ id: source.id })
      .from(source)
      .where(eq(source.id, sourceId));
    if (!existingSource) return fail("source_not_found");

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
    await touchLesson(transaction, lessonId, existing.value.updatedAt);
    return ok(lessonId);
  });
}

export async function deleteLessonSource(
  database: DataDatabase,
  lessonId: number,
  sourceId: number,
) {
  return database.transaction(async (transaction) => {
    const existing = await lockEditableDraft(transaction, lessonId);
    if (!existing.ok) return existing;

    const [existingSource] = await transaction
      .select({ id: source.id })
      .from(source)
      .where(eq(source.id, sourceId));
    if (!existingSource) return fail("source_not_found");

    const deleted = await transaction
      .delete(lessonSource)
      .where(
        and(
          eq(lessonSource.lessonId, lessonId),
          eq(lessonSource.sourceId, sourceId),
        ),
      )
      .returning({ lessonId: lessonSource.lessonId });
    if (!deleted.length) return ok(undefined);
    await touchLesson(transaction, lessonId, existing.value.updatedAt);
    return ok(undefined);
  });
}
