// An expected failure has one shape, so callers tell a refusal from a success only by `ok`.
export type Outcome<Value, Code extends string> =
  | { ok: true; value: Value }
  | { ok: false; code: Code };

export function ok<Value>(value: Value) {
  return { ok: true as const, value };
}

export function fail<Code extends string>(code: Code) {
  return { ok: false as const, code };
}
