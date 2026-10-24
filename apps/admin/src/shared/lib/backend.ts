import {
  type ProblemDetails,
  problemDetailsSchema,
} from "@ez-dk-citizen/api-contracts";

import type { BackendRequest, BackendResponse, Network } from "./network";

type BackendErrorDetails = Partial<
  Pick<ProblemDetails, "status" | "code" | "requestId" | "errors">
>;

export class BackendError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly errors?: ProblemDetails["errors"];

  constructor(message: string, details: BackendErrorDetails = {}) {
    super(message);
    ({
      status: this.status,
      code: this.code,
      requestId: this.requestId,
      errors: this.errors,
    } = details);
  }
}

// The authenticated request the screens use; App supplies the in-memory token.
export type Call = <T>(
  backendRequest: Omit<BackendRequest, "token">,
  schema: { parse(value: unknown): T },
) => Promise<T>;

export async function request<T>(
  network: Network,
  backendRequest: BackendRequest,
  schema: { parse(value: unknown): T },
): Promise<T> {
  let response: BackendResponse;
  try {
    response = await network.backend(backendRequest);
  } catch {
    throw new BackendError("Could not reach the Backend.");
  }

  if (response.status < 200 || response.status > 299) {
    const problem = problemDetailsSchema.safeParse(response.body);
    throw problem.success
      ? new BackendError(problem.data.detail, problem.data)
      : new BackendError(
          `The Backend responded with status ${response.status}.`,
          {
            status: response.status,
          },
        );
  }

  try {
    return schema.parse(response.body);
  } catch {
    throw new BackendError("The Backend returned an unexpected response.", {
      status: response.status,
    });
  }
}
