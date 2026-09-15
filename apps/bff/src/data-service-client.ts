import {
  createSourceRequestSchema,
  createPendingMediaAssetRequestSchema,
  createLessonRequestSchema,
  lessonDetailSchema,
  lessonDetailListResponseSchema,
  lessonListResponseSchema,
  mediaAssetResponseSchema,
  patchLessonRequestSchema,
  problemDetailsSchema,
  sourceListResponseSchema,
  sourceResponseSchema,
  upsertLessonSourceRequestSchema,
  upsertLessonTextRequestSchema,
  type CreateLessonRequest,
  type CreateSourceRequest,
  type CreatePendingMediaAssetRequest,
  type LessonDetail,
  type LessonDetailListResponse,
  type LessonListResponse,
  type MediaAssetResponse,
  type PatchLessonRequest,
  type ProblemDetails,
  type SourceListResponse,
  type SourceResponse,
  type UpsertLessonSourceRequest,
  type UpsertLessonTextRequest,
} from "@ez-dk-citizen/api-contracts";

export interface DataServiceClient {
  createPendingMediaAsset(
    input: CreatePendingMediaAssetRequest,
    requestId: string,
  ): Promise<MediaAssetResponse>;
  createLesson(
    input: CreateLessonRequest,
    requestId: string,
  ): Promise<LessonDetail>;
  upsertLessonText(
    lessonId: number,
    languageCode: string,
    input: UpsertLessonTextRequest,
    requestId: string,
  ): Promise<LessonDetail>;
  listLessons(requestId: string): Promise<LessonListResponse>;
  getLesson(id: number, requestId: string): Promise<LessonDetail>;
  patchLesson(
    id: number,
    input: PatchLessonRequest,
    requestId: string,
  ): Promise<LessonDetail>;
  createSource(
    input: CreateSourceRequest,
    requestId: string,
  ): Promise<SourceResponse>;
  listSources(requestId: string): Promise<SourceListResponse>;
  upsertLessonSource(
    lessonId: number,
    sourceId: number,
    input: UpsertLessonSourceRequest,
    requestId: string,
  ): Promise<LessonDetail>;
  deleteLessonSource(
    lessonId: number,
    sourceId: number,
    requestId: string,
  ): Promise<void>;
  listPublishedLessons(
    languageCode: string,
    requestId: string,
  ): Promise<LessonDetailListResponse>;
  getPublishedLesson(
    id: number,
    languageCode: string,
    requestId: string,
  ): Promise<LessonDetail>;
}

export class DataServiceError extends Error {
  constructor(readonly details: ProblemDetails) {
    super(details.detail);
  }

  get status(): number {
    return this.details.status;
  }
}

export function createDataServiceClient(
  baseUrl: string,
  token: string,
  timeoutMs = 2_000,
): DataServiceClient {
  const base = new URL(baseUrl);
  const call = <T>(
    path: string,
    method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT",
    requestId: string,
    body: unknown,
    parse: (value: unknown) => T,
  ) =>
    request(
      new URL(path, base),
      method,
      token,
      requestId,
      body,
      parse,
      timeoutMs,
    );

  return {
    createPendingMediaAsset: (input, requestId) =>
      call(
        "/internal/media-assets",
        "POST",
        requestId,
        createPendingMediaAssetRequestSchema.parse(input),
        mediaAssetResponseSchema.parse,
      ),
    createLesson: (input, requestId) =>
      call(
        "/internal/lessons",
        "POST",
        requestId,
        createLessonRequestSchema.parse(input),
        lessonDetailSchema.parse,
      ),
    upsertLessonText: (lessonId, languageCode, input, requestId) =>
      call(
        `/internal/lessons/${lessonId}/texts/${languageCode}`,
        "PUT",
        requestId,
        upsertLessonTextRequestSchema.parse(input),
        lessonDetailSchema.parse,
      ),
    listLessons: (requestId) =>
      call(
        "/internal/lessons",
        "GET",
        requestId,
        undefined,
        lessonListResponseSchema.parse,
      ),
    getLesson: (id, requestId) =>
      call(
        `/internal/lessons/${id}`,
        "GET",
        requestId,
        undefined,
        lessonDetailSchema.parse,
      ),
    patchLesson: (id, input, requestId) =>
      call(
        `/internal/lessons/${id}`,
        "PATCH",
        requestId,
        patchLessonRequestSchema.parse(input),
        lessonDetailSchema.parse,
      ),
    createSource: (input, requestId) =>
      call(
        "/internal/sources",
        "POST",
        requestId,
        createSourceRequestSchema.parse(input),
        sourceResponseSchema.parse,
      ),
    listSources: (requestId) =>
      call(
        "/internal/sources",
        "GET",
        requestId,
        undefined,
        sourceListResponseSchema.parse,
      ),
    upsertLessonSource: (lessonId, sourceId, input, requestId) =>
      call(
        `/internal/lessons/${lessonId}/sources/${sourceId}`,
        "PUT",
        requestId,
        upsertLessonSourceRequestSchema.parse(input),
        lessonDetailSchema.parse,
      ),
    deleteLessonSource: (lessonId, sourceId, requestId) =>
      call(
        `/internal/lessons/${lessonId}/sources/${sourceId}`,
        "DELETE",
        requestId,
        undefined,
        () => undefined,
      ),
    listPublishedLessons: (languageCode, requestId) =>
      call(
        `/internal/lessons?status=PUBLISHED&language=${encodeURIComponent(languageCode)}`,
        "GET",
        requestId,
        undefined,
        lessonDetailListResponseSchema.parse,
      ),
    getPublishedLesson: (id, languageCode, requestId) =>
      call(
        `/internal/lessons/${id}?status=PUBLISHED&language=${encodeURIComponent(languageCode)}`,
        "GET",
        requestId,
        undefined,
        lessonDetailSchema.parse,
      ),
  };
}

async function request<T>(
  url: URL,
  method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT",
  token: string,
  requestId: string,
  body: unknown,
  parse: (value: unknown) => T,
  timeoutMs: number,
): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Request-ID": requestId,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (signal.aborted || isAbortError(error)) {
      throw new DataServiceError(
        unavailableProblem("data_service_timeout", 504),
      );
    }
    throw new DataServiceError(unavailableProblem("data_service_unavailable"));
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (signal.aborted || isAbortError(error)) {
      throw new DataServiceError(
        unavailableProblem("data_service_timeout", 504),
      );
    }
    throw new DataServiceError(
      unavailableProblem("invalid_data_service_response"),
    );
  }
  if (!response.ok) {
    const details = problemDetailsSchema.safeParse(payload);
    if (details.success && details.data.status === response.status) {
      throw new DataServiceError(details.data);
    }
    throw new DataServiceError(
      unavailableProblem("invalid_data_service_response"),
    );
  }

  try {
    return parse(payload);
  } catch {
    throw new DataServiceError(
      unavailableProblem("invalid_data_service_response"),
    );
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

function unavailableProblem(code: string, status = 502): ProblemDetails {
  return problemDetailsSchema.parse({
    type: `https://ez-dk-citizen.invalid/problems/${code}`,
    title: status === 504 ? "Gateway Timeout" : "Bad Gateway",
    status,
    detail:
      status === 504
        ? "The Data Service timed out."
        : "The Data Service is unavailable.",
    instance: "/internal/lessons",
    code,
    requestId: "downstream",
  });
}
