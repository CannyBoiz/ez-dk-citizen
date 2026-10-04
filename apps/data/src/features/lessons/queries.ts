import type { LessonStatus } from "@ez-dk-citizen/api-contracts";
import { and, asc, desc, eq } from "drizzle-orm";

import type { DataDatabase } from "../../db/database.js";
import {
  language,
  lesson,
  lessonAudio,
  lessonSource,
  lessonText,
  mediaAsset,
  source,
} from "../../db/schema.js";

export type LessonReadFilters = { language?: string; status?: LessonStatus };

export async function listLessons(
  database: DataDatabase,
  { language: languageCode, status: filteredStatus }: LessonReadFilters,
) {
  if (languageCode !== undefined) {
    const [supported] = await database
      .select({ code: language.code })
      .from(language)
      .where(eq(language.code, languageCode));
    if (!supported) return "unsupported_language" as const;
    const rows = await database
      .select({ id: lesson.id })
      .from(lesson)
      .where(filteredStatus ? eq(lesson.status, filteredStatus) : undefined)
      .orderBy(asc(lesson.chapter), desc(lesson.version));
    const items = (
      await Promise.all(rows.map(({ id }) => loadLessonDetail(database, id)))
    )
      .filter((detail): detail is NonNullable<typeof detail> => Boolean(detail))
      .filter((detail) =>
        detail.lessonTexts.some((item) => item.languageCode === languageCode),
      );
    return { items };
  }
  const rows = await database
    .select()
    .from(lesson)
    .where(filteredStatus ? eq(lesson.status, filteredStatus) : undefined)
    .orderBy(asc(lesson.chapter), desc(lesson.version));
  const items = await Promise.all(
    rows.map(async ({ id }) => {
      const detail = await loadLessonDetail(database, id);
      if (!detail) throw new Error("Lesson could not be read.");
      return toSummary(detail);
    }),
  );
  return { items };
}

export async function readLesson(
  database: DataDatabase,
  id: number,
  { language: languageCode, status: filteredStatus }: LessonReadFilters,
) {
  if (languageCode !== undefined) {
    const [supported] = await database
      .select({ code: language.code })
      .from(language)
      .where(eq(language.code, languageCode));
    if (!supported) return "unsupported_language" as const;
  }
  const detail = await loadLessonDetail(database, id);
  if (!detail) return "lesson_not_found" as const;
  if (filteredStatus && detail.status !== filteredStatus)
    return "lesson_not_found" as const;
  if (languageCode) {
    const text = detail.lessonTexts.find(
      (item) => item.languageCode === languageCode,
    );
    if (!text) return "lesson_text_not_found" as const;
  }
  if (filteredStatus === "PUBLISHED" && languageCode) {
    const currentAudio = await selectCurrentAudio(database, id, languageCode);
    if (!currentAudio) return { ...detail, currentAudio: null };
    const { originalFilename: _originalFilename, ...published } = currentAudio;
    return { ...detail, currentAudio: published };
  }
  return detail;
}

// The current READY Lesson Audio for one Lesson and Language, whatever the Lesson's status.
export async function readCurrentLessonAudio(
  database: DataDatabase,
  id: number,
  languageCode: string,
) {
  const [supported] = await database
    .select({ code: language.code })
    .from(language)
    .where(eq(language.code, languageCode));
  if (!supported) return "unsupported_language" as const;
  const [existing] = await database
    .select({ id: lesson.id })
    .from(lesson)
    .where(eq(lesson.id, id));
  if (!existing) return "lesson_not_found" as const;
  return {
    audio: (await selectCurrentAudio(database, id, languageCode)) ?? null,
  };
}

async function selectCurrentAudio(
  database: DataDatabase,
  id: number,
  languageCode: string,
) {
  const [currentAudio] = await database
    .select({
      mediaAssetId: lessonAudio.mediaAssetId,
      audioVersion: lessonAudio.audioVersion,
      originalFilename: mediaAsset.originalFilename,
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
  return (
    currentAudio && {
      ...currentAudio,
      sizeBytes: Number(currentAudio.sizeBytes),
      durationMs:
        currentAudio.durationMs === null
          ? null
          : Number(currentAudio.durationMs),
    }
  );
}

export async function loadLessonDetail(database: DataDatabase, id: number) {
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
