import type {
  CompleteMediaAssetRequest,
  CompleteMediaAssetResponse,
  CreateLessonRequest,
  CreatePendingMediaAssetRequest,
  CreateSourceRequest,
  CurrentLessonAudioResponse,
  DeleteLessonResponse,
  LessonDetail,
  LessonDetailListResponse,
  LessonListResponse,
  LessonStatus,
  MediaAssetResponse,
  PatchLessonRequest,
  ProblemDetails,
  PublishedLessonDetail,
  SourceListResponse,
  SourceResponse,
  UpdateSourceRequest,
  UpsertLessonSourceRequest,
  UpsertLessonTextRequest,
} from "@ez-dk-citizen/api-contracts";
import { sql } from "drizzle-orm";

import { createDataOperations } from "./data-operations.js";
import { createDataDatabase } from "./db/database.js";
import type { LessonReadFilters } from "./features/lessons/queries.js";

// The package's only public API. Operations return contract-shaped results or outcome codes;
// mapping those to HTTP is the caller's job.
export interface DataModule {
  createPendingMediaAsset(
    input: CreatePendingMediaAssetRequest,
  ): Promise<MediaAssetResponse | "unsupported_language">;
  getMediaAsset(
    id: number,
  ): Promise<MediaAssetResponse | "media_asset_not_found">;
  failMediaAsset(
    id: number,
  ): Promise<"media_asset_not_found" | "media_asset_not_pending" | undefined>;
  completeMediaAsset(
    id: number,
    input: CompleteMediaAssetRequest,
  ): Promise<
    | CompleteMediaAssetResponse
    | "media_asset_not_found"
    | "media_asset_not_pending"
    | "media_asset_failed"
    | "media_asset_rebind_conflict"
    | "unsupported_language"
    | "lesson_not_found"
    | "lesson_archived"
    | "lesson_text_not_found"
  >;
  createLesson(input: CreateLessonRequest): Promise<LessonDetail>;
  listLessons(status?: LessonStatus): Promise<LessonListResponse>;
  // Lessons with a Lesson Text in the Language, in full.
  listLessonsInLanguage(
    languageCode: string,
    status?: LessonStatus,
  ): Promise<LessonDetailListResponse | "unsupported_language">;
  getLesson(
    id: number,
    filters?: LessonReadFilters,
  ): Promise<
    | LessonDetail
    | "unsupported_language"
    | "lesson_not_found"
    | "lesson_text_not_found"
  >;
  // A publication refused for missing prerequisites lists them as `missing`.
  patchLesson(
    id: number,
    input: PatchLessonRequest,
  ): Promise<
    | LessonDetail
    | "lesson_not_found"
    | "lesson_not_editable"
    | "lesson_lifecycle_conflict"
    | "unsupported_language"
    | "change_kind_required"
    | "published_lesson_conflict"
    | "lesson_version_conflict"
    | { missing: NonNullable<ProblemDetails["errors"]> }
  >;
  deleteLesson(
    id: number,
  ): Promise<DeleteLessonResponse | "lesson_not_found" | "lesson_not_editable">;
  upsertLessonText(
    lessonId: number,
    languageCode: string,
    input: UpsertLessonTextRequest,
  ): Promise<
    | LessonDetail
    | "lesson_not_found"
    | "lesson_not_editable"
    | "unsupported_language"
  >;
  upsertLessonSource(
    lessonId: number,
    sourceId: number,
    input: UpsertLessonSourceRequest,
  ): Promise<
    | LessonDetail
    | "lesson_not_found"
    | "lesson_not_editable"
    | "source_not_found"
  >;
  deleteLessonSource(
    lessonId: number,
    sourceId: number,
  ): Promise<
    "lesson_not_found" | "lesson_not_editable" | "source_not_found" | undefined
  >;
  getPublishedLesson(
    id: number,
    languageCode: string,
  ): Promise<
    | PublishedLessonDetail
    | "unsupported_language"
    | "lesson_not_found"
    | "lesson_text_not_found"
  >;
  getCurrentLessonAudio(
    lessonId: number,
    languageCode: string,
  ): Promise<
    CurrentLessonAudioResponse | "unsupported_language" | "lesson_not_found"
  >;
  createSource(
    input: CreateSourceRequest,
  ): Promise<SourceResponse | "source_url_conflict">;
  listSources(): Promise<SourceListResponse>;
  updateSource(
    id: number,
    input: UpdateSourceRequest,
  ): Promise<SourceResponse | "source_not_found" | "source_url_conflict">;
  checkReadiness(): Promise<void>;
  close(): Promise<void>;
}

// A connection attempt that takes longer than connectionTimeoutMs fails.
export function createDataModule(
  databaseUrl: string,
  connectionTimeoutMs: number,
): DataModule {
  const { database, pool } = createDataDatabase(
    databaseUrl,
    connectionTimeoutMs,
  );
  return {
    ...createDataOperations(database),
    checkReadiness: async () => {
      await database.execute(sql`select 1`);
    },
    close: () => pool.end(),
  };
}
