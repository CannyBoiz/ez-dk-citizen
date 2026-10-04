export function isPostgresError(
  error: unknown,
  code: string,
  constraint?: string,
): boolean {
  let candidate = error;
  while (candidate && typeof candidate === "object") {
    if (
      "code" in candidate &&
      candidate.code === code &&
      (!constraint ||
        ("constraint" in candidate && candidate.constraint === constraint))
    ) {
      return true;
    }
    candidate = "cause" in candidate ? candidate.cause : undefined;
  }
  return false;
}
