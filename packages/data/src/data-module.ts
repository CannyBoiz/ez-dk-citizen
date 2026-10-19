import type {
  CompleteMediaAssetRequest,
  CompleteMediaAssetResponse,
  CreateLessonRequest,
  CreateSourceRequest,
  LessonDetail,
  LessonListResponse,
  LessonStatus,
  PatchLessonRequest,
  ProblemDetails,
  SourceListResponse,
  SourceResponse,
  UpdateSourceRequest,
  UpsertLessonSourceRequest,
  UpsertLessonTextRequest,
} from "@ez-dk-citizen/api-contracts";
import { sql } from "drizzle-orm";

import { createDataOperations } from "./data-operations.js";
import { createDataDatabase } from "./db/database.js";
import { databaseTimeoutMessage } from "./db/errors.js";
import type { LessonReadFilters } from "./features/lessons/queries.js";
import type { PendingMediaAsset } from "./features/media-assets/mutations.js";
import type {
  CurrentLessonAudioResult,
  DeleteLessonResult,
  LessonDetailList,
  MediaAsset,
  PublishedLessonDetail,
} from "./results.js";

export { isDatabaseUnavailable } from "./db/errors.js";
export * from "./results.js";

// The package's only public API. Operations return contract-shaped results or outcome codes;
// mapping those to HTTP is the caller's job.
export interface DataModule {
  createPendingMediaAsset(
    input: PendingMediaAsset,
  ): Promise<MediaAsset | "unsupported_language">;
  getMediaAsset(id: number): Promise<MediaAsset | "media_asset_not_found">;
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
  ): Promise<LessonDetailList | "unsupported_language">;
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
  ): Promise<DeleteLessonResult | "lesson_not_found" | "lesson_not_editable">;
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
    CurrentLessonAudioResult | "unsupported_language" | "lesson_not_found"
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

// Every operation, readiness included, fails after timeoutMs, and isDatabaseUnavailable
// recognises the error.
export function createDataModule(
  databaseUrl: string,
  timeoutMs: number,
): DataModule {
  const { database, pool } = createDataDatabase(databaseUrl, timeoutMs);
  const operations: Omit<DataModule, "close"> = {
    ...createDataOperations(database),
    checkReadiness: async () => {
      await database.execute(sql`select 1`);
    },
  };
  const bounded = Object.fromEntries(
    Object.entries(operations).map(([name, operation]) => [
      name,
      (...args: unknown[]) =>
        withinTimeout(
          (operation as (...args: unknown[]) => Promise<unknown>)(...args),
          timeoutMs,
        ),
    ]),
  ) as typeof operations;
  return { ...bounded, close: () => pool.end() };
}

// Gives up waiting rather than cancelling: cutting a query off client-side would hand
// its connection back to the pool mid-transaction.
// ponytail: the abandoned query keeps its connection until PostgreSQL answers or the socket dies.
async function withinTimeout<Result>(
  operation: Promise<Result>,
  timeoutMs: number,
): Promise<Result> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(databaseTimeoutMessage)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
