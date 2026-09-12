import {
  createSourceRequestSchema,
  createLessonRequestSchema,
  lessonDetailSchema,
  lessonListResponseSchema,
  patchLessonRequestSchema,
  problemDetailsSchema,
  sourceListResponseSchema,
  sourceResponseSchema,
  upsertLessonSourceRequestSchema,
  upsertLessonTextRequestSchema,
  type CreateLessonRequest,
  type CreateSourceRequest,
  type LessonDetail,
  type LessonListResponse,
  type PatchLessonRequest,
  type ProblemDetails,
  type SourceListResponse,
  type SourceResponse,
  type UpsertLessonSourceRequest,
  type UpsertLessonTextRequest,
} from "@ez-dk-citizen/api-contracts";

export interface DataServiceClient {
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

  return {
    createLesson: (input, requestId) =>
      request(
        new URL("/internal/lessons", base),
        "POST",
        token,
        requestId,
        createLessonRequestSchema.parse(input),
        lessonDetailSchema.parse,
        timeoutMs,
      ),
    upsertLessonText: (lessonId, languageCode, input, requestId) =>
      request(
        new URL(`/internal/lessons/${lessonId}/texts/${languageCode}`, base),
        "PUT",
        token,
        requestId,
        upsertLessonTextRequestSchema.parse(input),
        lessonDetailSchema.parse,
        timeoutMs,
      ),
    listLessons: (requestId) =>
      request(
        new URL("/internal/lessons", base),
        "GET",
        token,
        requestId,
        undefined,
        lessonListResponseSchema.parse,
        timeoutMs,
      ),
    getLesson: (id, requestId) =>
      request(
        new URL(`/internal/lessons/${id}`, base),
        "GET",
        token,
        requestId,
        undefined,
        lessonDetailSchema.parse,
        timeoutMs,
      ),
    patchLesson: (id, input, requestId) =>
      request(
        new URL(`/internal/lessons/${id}`, base),
        "PATCH",
        token,
        requestId,
        patchLessonRequestSchema.parse(input),
        lessonDetailSchema.parse,
        timeoutMs,
      ),
    createSource: (input, requestId) =>
      request(
        new URL("/internal/sources", base),
        "POST",
        token,
        requestId,
        createSourceRequestSchema.parse(input),
        sourceResponseSchema.parse,
        timeoutMs,
      ),
    listSources: (requestId) =>
      request(
        new URL("/internal/sources", base),
        "GET",
        token,
        requestId,
        undefined,
        sourceListResponseSchema.parse,
        timeoutMs,
      ),
    upsertLessonSource: (lessonId, sourceId, input, requestId) =>
      request(
        new URL(`/internal/lessons/${lessonId}/sources/${sourceId}`, base),
        "PUT",
        token,
        requestId,
        upsertLessonSourceRequestSchema.parse(input),
        lessonDetailSchema.parse,
        timeoutMs,
      ),
    deleteLessonSource: (lessonId, sourceId, requestId) =>
      request(
        new URL(`/internal/lessons/${lessonId}/sources/${sourceId}`, base),
        "DELETE",
        token,
        requestId,
        undefined,
        () => undefined,
        timeoutMs,
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
      throw new DataServiceError(unavailableProblem("data_service_timeout", 504));
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
    throw new DataServiceError(unavailableProblem("invalid_data_service_response"));
  }
  if (!response.ok) {
    const details = problemDetailsSchema.safeParse(payload);
    if (details.success && details.data.status === response.status) {
      throw new DataServiceError(details.data);
    }
    throw new DataServiceError(unavailableProblem("invalid_data_service_response"));
  }

  try {
    return parse(payload);
  } catch {
    throw new DataServiceError(unavailableProblem("invalid_data_service_response"));
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError");
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
