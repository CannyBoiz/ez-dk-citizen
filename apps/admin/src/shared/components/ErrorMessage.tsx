// Shows a BFF error's message and request ID, with an optional Retry.
import { BffError } from "../lib/bff";

export function ErrorMessage({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { message, requestId } =
    error instanceof BffError ? error : new BffError("Something went wrong.");
  return (
    <p role="alert">
      {message}
      {requestId && (
        <>
          {" "}
          Request ID: <code>{requestId}</code>
        </>
      )}
      {onRetry && (
        <>
          {" "}
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </>
      )}
    </p>
  );
}
