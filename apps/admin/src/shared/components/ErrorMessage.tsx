// Shows a BFF or storage error's message and any request ID, with an optional Retry and
// extra detail.
import type { ReactNode } from "react";

import { BffError } from "../lib/bff";
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
    error instanceof BffError
      ? error
      : error instanceof StorageError
        ? { message: error.message, requestId: undefined }
        : new BffError("Something went wrong.");
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
