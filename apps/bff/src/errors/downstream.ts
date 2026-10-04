import { DataServiceError } from "../data-service/client.js";
import { problem } from "./problem-details.js";

export function mapDataServiceError(
  c: Parameters<typeof problem>[0],
  error: unknown,
) {
  if (!(error instanceof DataServiceError)) {
    return problem(
      c,
      502,
      "data_service_unavailable",
      "The Data Service is unavailable.",
    );
  }

  const knownStatus =
    error.status === 404 &&
    [
      "lesson_not_found",
      "lesson_text_not_found",
      "media_asset_not_found",
      "source_not_found",
    ].includes(error.details.code)
      ? 404
      : error.status === 409 &&
          [
            "lesson_not_editable",
            "lesson_lifecycle_conflict",
            "lesson_text_not_found",
            "lesson_version_conflict",
            "published_lesson_conflict",
            "lesson_publication_incomplete",
            "lesson_archived",
            "media_asset_not_pending",
            "media_asset_failed",
            "media_asset_rebind_conflict",
            "source_url_conflict",
          ].includes(error.details.code)
        ? 409
        : error.status === 422 &&
            [
              "invalid_lesson_id",
              "invalid_source_id",
              "unsupported_language",
              "validation_failed",
            ].includes(error.details.code)
          ? 422
          : undefined;
  if (knownStatus) {
    return problem(
      c,
      knownStatus,
      error.details.code,
      error.details.detail,
      error.details.errors,
    );
  }
  if (error.status === 504) {
    return problem(
      c,
      504,
      "data_service_timeout",
      "The Data Service timed out.",
    );
  }
  return problem(
    c,
    502,
    "data_service_unavailable",
    "The Data Service is unavailable.",
  );
}
