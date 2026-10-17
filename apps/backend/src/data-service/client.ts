import {
  type CompleteMediaAssetRequest,
  type CompleteMediaAssetResponse,
  type CreatePendingMediaAssetRequest,
  type CurrentLessonAudioResponse,
  completeMediaAssetRequestSchema,
  completeMediaAssetResponseSchema,
  createPendingMediaAssetRequestSchema,
  currentLessonAudioResponseSchema,
  type LessonDetailListResponse,
  lessonDetailListResponseSchema,
  type MediaAssetResponse,
  mediaAssetLookupResponseSchema,
  mediaAssetResponseSchema,
  type ProblemDetails,
  type PublishedLessonDetail,
  problemDetailsSchema,
  publishedLessonDetailSchema,
} from "@ez-dk-citizen/api-contracts";

export interface DataServiceClient {
  createPendingMediaAsset(
    input: CreatePendingMediaAssetRequest,
    requestId: string,
  ): Promise<MediaAssetResponse>;
  getMediaAsset(id: number, requestId: string): Promise<MediaAssetResponse>;
  failMediaAsset(id: number, requestId: string): Promise<void>;
  completeMediaAsset(
    id: number,
    input: CompleteMediaAssetRequest,
    requestId: string,
  ): Promise<CompleteMediaAssetResponse>;
  listPublishedLessons(
    languageCode: string,
    requestId: string,
  ): Promise<LessonDetailListResponse>;
  getPublishedLesson(
    id: number,
    languageCode: string,
    requestId: string,
  ): Promise<PublishedLessonDetail>;
  getCurrentLessonAudio(
    lessonId: number,
    languageCode: string,
    requestId: string,
  ): Promise<CurrentLessonAudioResponse>;
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
    method: "GET" | "POST",
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
    getMediaAsset: (id, requestId) =>
      call(
        `/internal/media-assets/${id}`,
        "GET",
        requestId,
        undefined,
        mediaAssetLookupResponseSchema.parse,
      ),
    failMediaAsset: (id, requestId) =>
      call(
        `/internal/media-assets/${id}/fail`,
        "POST",
        requestId,
        undefined,
        () => undefined,
      ),
    completeMediaAsset: (id, input, requestId) =>
      call(
        `/internal/media-assets/${id}/complete`,
        "POST",
        requestId,
        completeMediaAssetRequestSchema.parse(input),
        completeMediaAssetResponseSchema.parse,
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
        publishedLessonDetailSchema.parse,
      ),
    getCurrentLessonAudio: (lessonId, languageCode, requestId) =>
      call(
        `/internal/lessons/${lessonId}/audio/${encodeURIComponent(languageCode)}`,
        "GET",
        requestId,
        undefined,
        currentLessonAudioResponseSchema.parse,
      ),
  };
}

async function request<T>(
  url: URL,
  method: "GET" | "POST",
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
