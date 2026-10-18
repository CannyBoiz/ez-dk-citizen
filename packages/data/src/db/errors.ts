export function isPostgresError(
  error: unknown,
  code: string,
  constraint?: string,
): boolean {
  return causes(error).some(
    (candidate) =>
      "code" in candidate &&
      candidate.code === code &&
      (!constraint ||
        ("constraint" in candidate && candidate.constraint === constraint)),
  );
}

export const databaseTimeoutMessage = "PostgreSQL did not answer in time.";

// The module's own timeout and pg's lost or timed-out connections are known by message,
// the network by a system error code, and PostgreSQL by SQLSTATE: class 08, shutdown,
// or no free slots.
const unavailableMessages = [
  databaseTimeoutMessage,
  "Connection terminated",
  "timeout exceeded when trying to connect",
];
const unavailableCodes = [
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "53300",
  "57P01",
  "57P02",
  "57P03",
];

// True when PostgreSQL could not be reached or stopped answering, as opposed to a bug
// or a refused statement.
export function isDatabaseUnavailable(error: unknown): boolean {
  return causes(error).some(
    (candidate) =>
      (candidate instanceof Error &&
        unavailableMessages.some((message) =>
          candidate.message.startsWith(message),
        )) ||
      ("code" in candidate &&
        typeof candidate.code === "string" &&
        (unavailableCodes.includes(candidate.code) ||
          candidate.code.startsWith("08"))),
  );
}

function causes(error: unknown): object[] {
  const chain: object[] = [];
  for (
    let candidate = error;
    candidate && typeof candidate === "object";
    candidate = "cause" in candidate ? candidate.cause : undefined
  ) {
    chain.push(candidate);
  }
  return chain;
}
