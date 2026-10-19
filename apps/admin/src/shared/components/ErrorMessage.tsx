// Shows a Backend or storage error's message and any request ID, with an optional Retry and
// extra detail. A 500 is a Backend bug rather than an outage, so it points at the logs.
import type { ReactNode } from "react";

import { BackendError } from "../lib/backend";
import { StorageError } from "../lib/network";

export function ErrorMessage({
  error,
  context,
  onRetry,
  children,
}: {
  error: unknown;
  // What failed, shown before the message, such as "Upload failed".
  context?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  const { message, requestId } =
    error instanceof BackendError
      ? error
      : error instanceof StorageError
        ? { message: error.message, requestId: undefined }
        : new BackendError("Something went wrong.");
  return (
    <div role="alert">
      {context && `${context}: `}
      {message}
      {requestId && (
        <>
          {" "}
          Request ID: <code>{requestId}</code>
        </>
      )}
      {error instanceof BackendError && error.status === 500 && (
        <>
          {" "}
          The server failed unexpectedly. Look up the request ID in the Backend
          logs.
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
      {children}
    </div>
  );
}
