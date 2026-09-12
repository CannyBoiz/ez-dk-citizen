import {
  createLessonRequestSchema,
  lessonDetailSchema,
  lessonListResponseSchema,
  problemDetailsSchema,
  type CreateLessonRequest,
  type LessonDetail,
  type LessonListResponse,
  type ProblemDetails,
} from "@ez-dk-citizen/api-contracts";

export interface DataServiceClient {
  createLesson(
    input: CreateLessonRequest,
    requestId: string,
  ): Promise<LessonDetail>;
  listLessons(requestId: string): Promise<LessonListResponse>;
  getLesson(id: number, requestId: string): Promise<LessonDetail>;
}

export class DataServiceError extends Error {
  constructor(
    readonly status: number,
    readonly details: ProblemDetails,
  ) {
    super(details.detail);
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
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Request-ID": requestId,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new DataServiceError(
        504,
        unavailableProblem("data_service_timeout"),
      );
    }
    throw new DataServiceError(
      502,
      unavailableProblem("data_service_unavailable"),
    );
  }

  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const details = problemDetailsSchema.safeParse(payload);
    if (details.success)
      throw new DataServiceError(response.status, details.data);
    throw new DataServiceError(
      502,
      unavailableProblem("invalid_data_service_response"),
    );
  }

  try {
    return parse(payload);
  } catch {
    throw new DataServiceError(
      502,
      unavailableProblem("invalid_data_service_response"),
    );
  }
}

function unavailableProblem(code: string): ProblemDetails {
  return problemDetailsSchema.parse({
    type: `https://ez-dk-citizen.invalid/problems/${code}`,
    title: "Bad Gateway",
    status: 502,
    detail: "The Data Service is unavailable.",
    instance: "/internal/lessons",
    code,
    requestId: "downstream",
  });
}
