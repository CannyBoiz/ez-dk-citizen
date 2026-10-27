import {
  completeMediaAssetResponseSchema,
  lessonDetailSchema,
  lessonListResponseSchema,
  sourceListResponseSchema,
  sourceResponseSchema,
} from "@ez-dk-citizen/api-contracts";

import type { DataModule } from "./data-module.js";
import type { DataDatabase } from "./db/database.js";
import { isPostgresError } from "./db/errors.js";
import {
  createLesson,
  deleteLesson,
  deleteLessonSource,
  patchLesson,
  upsertLessonSource,
  upsertLessonText,
} from "./features/lessons/mutations.js";
import {
  listLessons,
  listLessonsInLanguage,
  loadLessonDetail,
  readCurrentLessonAudio,
  readLesson,
  readPublishedLesson,
} from "./features/lessons/queries.js";
import {
  completeMediaAsset,
  createPendingMediaAsset,
} from "./features/media-assets/mutations.js";
import { findMediaAsset } from "./features/media-assets/queries.js";
import {
  toCompletedMediaAsset,
  toLessonAudio,
  toMediaAsset,
} from "./features/media-assets/serializers.js";
import {
  createSource,
  listSources,
  updateSource,
} from "./features/sources/operations.js";
import { fail, ok } from "./outcome.js";
import {
  currentLessonAudioResultSchema,
  deleteLessonResultSchema,
  lessonDetailListSchema,
  mediaAssetSchema,
  publishedLessonDetailSchema,
} from "./results.js";

export type DataOperations = Omit<DataModule, "checkReadiness" | "close">;

export function createDataOperations(database: DataDatabase): DataOperations {
  const readLessonDetail = async (id: number) => {
    const detail = await loadLessonDetail(database, id);
    if (!detail) throw new Error("Lesson could not be read.");
    return lessonDetailSchema.parse(detail);
  };
  // Feature mutations succeed with the Lesson's id.
  const detailOrOutcome = async <Refusal extends { ok: false }>(
    outcome: { ok: true; value: number } | Refusal,
  ) => (outcome.ok ? ok(await readLessonDetail(outcome.value)) : outcome);

  return {
    createPendingMediaAsset: async (input) => {
      const created = await createPendingMediaAsset(database, input);
      return created.ok
        ? ok(mediaAssetSchema.parse(toMediaAsset(created.value)))
        : created;
    },
    getMediaAsset: async (id) => {
      const asset = await findMediaAsset(database, id);
      return asset
        ? ok(mediaAssetSchema.parse(toMediaAsset(asset)))
        : fail("media_asset_not_found");
    },
    completeMediaAsset: async (id, input, storedObject) => {
      const outcome = await completeMediaAsset(
        database,
        id,
        input,
        storedObject,
      );
      return outcome.ok
        ? ok(
            completeMediaAssetResponseSchema.parse({
              mediaAsset: toCompletedMediaAsset(outcome.value.readyAsset),
              lessonAudio: toLessonAudio(outcome.value.audio),
            }),
          )
        : outcome;
    },
    createLesson: async (input) =>
      detailOrOutcome(await createLesson(database, input)),
    listLessons: async (status) =>
      lessonListResponseSchema.parse(await listLessons(database, status)),
    listLessonsInLanguage: async (languageCode, status) => {
      const result = await listLessonsInLanguage(
        database,
        languageCode,
        status,
      );
      return result.ok
        ? ok(lessonDetailListSchema.parse(result.value))
        : result;
    },
    getLesson: async (id, filters = {}) => {
      const detail = await readLesson(database, id, filters);
      return detail.ok ? ok(lessonDetailSchema.parse(detail.value)) : detail;
    },
    patchLesson: async (id, input) => {
      try {
        return await detailOrOutcome(await patchLesson(database, id, input));
      } catch (error) {
        if (
          isPostgresError(error, "23505", "lesson_one_published_per_chapter")
        ) {
          return fail("published_lesson_conflict");
        }
        if (isPostgresError(error, "23505"))
          return fail("lesson_version_conflict");
        throw error;
      }
    },
    deleteLesson: async (id) => {
      const outcome = await deleteLesson(database, id);
      return outcome.ok
        ? ok(
            deleteLessonResultSchema.parse({
              deletedMediaAssets: outcome.value,
            }),
          )
        : outcome;
    },
    upsertLessonText: async (lessonId, languageCode, input) =>
      detailOrOutcome(
        await upsertLessonText(database, lessonId, languageCode, input),
      ),
    upsertLessonSource: async (lessonId, sourceId, input) =>
      detailOrOutcome(
        await upsertLessonSource(database, lessonId, sourceId, input),
      ),
    deleteLessonSource: (lessonId, sourceId) =>
      deleteLessonSource(database, lessonId, sourceId),
    getPublishedLesson: async (id, languageCode) => {
      const detail = await readPublishedLesson(database, id, languageCode);
      return detail.ok
        ? ok(publishedLessonDetailSchema.parse(detail.value))
        : detail;
    },
    getCurrentLessonAudio: async (lessonId, languageCode) => {
      const outcome = await readCurrentLessonAudio(
        database,
        lessonId,
        languageCode,
      );
      return outcome.ok
        ? ok(currentLessonAudioResultSchema.parse(outcome.value))
        : outcome;
    },
    createSource: (input) =>
      orSourceUrlConflict(async () =>
        ok(sourceResponseSchema.parse(await createSource(database, input))),
      ),
    listSources: async () =>
      sourceListResponseSchema.parse(await listSources(database)),
    updateSource: (id, input) =>
      orSourceUrlConflict(async () => {
        const updated = await updateSource(database, id, input);
        return updated
          ? ok(sourceResponseSchema.parse(updated))
          : fail("source_not_found");
      }),
  };
}

async function orSourceUrlConflict<Result>(operation: () => Promise<Result>) {
  try {
    return await operation();
  } catch (error) {
    if (isPostgresError(error, "23505")) return fail("source_url_conflict");
    throw error;
  }
}
