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
  // Feature mutations return the Lesson's id on success and an outcome code otherwise.
  const detailOrOutcome = async <Outcome>(outcome: number | Outcome) =>
    typeof outcome === "number" ? readLessonDetail(outcome) : outcome;

  return {
    createPendingMediaAsset: async (input) => {
      const created = await createPendingMediaAsset(database, input);
      return typeof created === "string"
        ? created
        : mediaAssetSchema.parse(toMediaAsset(created));
    },
    getMediaAsset: async (id) => {
      const asset = await findMediaAsset(database, id);
      return asset
        ? mediaAssetSchema.parse(toMediaAsset(asset))
        : "media_asset_not_found";
    },
    completeMediaAsset: async (id, input, storedObject) => {
      const outcome = await completeMediaAsset(
        database,
        id,
        input,
        storedObject,
      );
      return typeof outcome === "string"
        ? outcome
        : completeMediaAssetResponseSchema.parse({
            mediaAsset: toCompletedMediaAsset(outcome.readyAsset),
            lessonAudio: toLessonAudio(outcome.audio),
          });
    },
    createLesson: async (input) =>
      detailOrOutcome(await createLesson(database, input)),
    listLessons: async (status) =>
      lessonListResponseSchema.parse(await listLessons(database, { status })),
    listLessonsInLanguage: async (languageCode, status) => {
      const result = await listLessons(database, {
        language: languageCode,
        status,
      });
      return result === "unsupported_language"
        ? result
        : lessonDetailListSchema.parse(result);
    },
    getLesson: async (id, filters = {}) => {
      const detail = await readLesson(database, id, filters);
      return typeof detail === "string"
        ? detail
        : lessonDetailSchema.parse(detail);
    },
    patchLesson: async (id, input) => {
      try {
        return await detailOrOutcome(await patchLesson(database, id, input));
      } catch (error) {
        if (
          isPostgresError(error, "23505", "lesson_one_published_per_chapter")
        ) {
          return "published_lesson_conflict";
        }
        if (isPostgresError(error, "23505")) return "lesson_version_conflict";
        throw error;
      }
    },
    deleteLesson: async (id) => {
      const outcome = await deleteLesson(database, id);
      return typeof outcome === "string"
        ? outcome
        : deleteLessonResultSchema.parse({ deletedMediaAssets: outcome });
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
      return typeof detail === "string"
        ? detail
        : publishedLessonDetailSchema.parse(detail);
    },
    getCurrentLessonAudio: async (lessonId, languageCode) => {
      const outcome = await readCurrentLessonAudio(
        database,
        lessonId,
        languageCode,
      );
      return typeof outcome === "string"
        ? outcome
        : currentLessonAudioResultSchema.parse(outcome);
    },
    createSource: (input) =>
      orSourceUrlConflict(async () =>
        sourceResponseSchema.parse(await createSource(database, input)),
      ),
    listSources: async () =>
      sourceListResponseSchema.parse(await listSources(database)),
    updateSource: (id, input) =>
      orSourceUrlConflict(async () => {
        const updated = await updateSource(database, id, input);
        return updated
          ? sourceResponseSchema.parse(updated)
          : "source_not_found";
      }),
  };
}

async function orSourceUrlConflict<Result>(operation: () => Promise<Result>) {
  try {
    return await operation();
  } catch (error) {
    if (isPostgresError(error, "23505")) return "source_url_conflict" as const;
    throw error;
  }
}
