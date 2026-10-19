import { problem } from "./problem-details.js";

export function storageFailureProblem(
  c: Parameters<typeof problem>[0],
  error: unknown,
  missingObjectIsIncomplete = true,
) {
  const name = storageErrorName(error);
  if (
    missingObjectIsIncomplete &&
    ["NoSuchKey", "NotFound", "NoSuchObject"].includes(name)
  ) {
    return problem(
      c,
      409,
      "upload_incomplete",
      "Uploaded object is not available yet.",
    );
  }
  if (["TimeoutError", "RequestTimeout", "ETIMEDOUT"].includes(name)) {
    return problem(c, 504, "storage_timeout", "Storage timed out.");
  }
  return problem(c, 503, "storage_unavailable", "Storage is unavailable.");
}

export function logStorageFailure(
  requestId: string,
  operation: "upload" | "inspect" | "delete" | "playback",
  mediaAssetId: number,
  error: unknown,
) {
  console.log(
    JSON.stringify({
      requestId,
      operation,
      mediaAssetId,
      storageErrorCode: storageErrorName(error),
      storageRequestId: storageRequestId(error),
    }),
  );
}

function storageErrorName(error: unknown) {
  return error &&
    typeof error === "object" &&
    "name" in error &&
    typeof error.name === "string"
    ? error.name
    : "unknown";
}

function storageRequestId(error: unknown) {
  if (!error || typeof error !== "object" || !("$metadata" in error)) {
    return undefined;
  }
  const metadata = error.$metadata;
  return metadata &&
    typeof metadata === "object" &&
    "requestId" in metadata &&
    typeof metadata.requestId === "string"
    ? metadata.requestId
    : undefined;
}
