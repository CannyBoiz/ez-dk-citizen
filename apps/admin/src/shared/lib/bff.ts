import {
  problemDetailsSchema,
  type ProblemDetails,
} from "@ez-dk-citizen/api-contracts/schemas";

import type { BffRequest, BffResponse, Network } from "./network";

type BffErrorDetails = Partial<
  Pick<ProblemDetails, "status" | "code" | "requestId" | "errors">
>;

export class BffError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly errors?: ProblemDetails["errors"];

  constructor(message: string, details: BffErrorDetails = {}) {
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
  bffRequest: Omit<BffRequest, "token">,
  schema: { parse(value: unknown): T },
) => Promise<T>;

export async function request<T>(
  network: Network,
  bffRequest: BffRequest,
  schema: { parse(value: unknown): T },
): Promise<T> {
  let response: BffResponse;
  try {
    response = await network.bff(bffRequest);
  } catch {
    throw new BffError("Could not reach the BFF.");
  }

  if (response.status < 200 || response.status > 299) {
    const problem = problemDetailsSchema.safeParse(response.body);
    throw problem.success
      ? new BffError(problem.data.detail, problem.data)
      : new BffError(`The BFF responded with status ${response.status}.`, {
          status: response.status,
        });
  }

  try {
    return schema.parse(response.body);
  } catch {
    throw new BffError("The BFF returned an unexpected response.", {
      status: response.status,
    });
  }
}
