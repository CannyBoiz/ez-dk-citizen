export function toMediaAsset(row: {
  id: number;
  storageProvider: string;
  storageContainer: string;
  objectKey: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: bigint;
  durationMs: bigint | null;
  status: "PENDING" | "READY" | "FAILED" | "DELETED";
  createdAt: Date;
  uploadedAt: Date | null;
}) {
  return {
    id: row.id,
    storageProvider: row.storageProvider,
    storageContainer: row.storageContainer,
    objectKey: row.objectKey,
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    sizeBytes: toSafeNumber(row.sizeBytes),
    durationMs: row.durationMs === null ? null : toSafeNumber(row.durationMs),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    uploadedAt: row.uploadedAt?.toISOString() ?? null,
  };
}

export function toCompletedMediaAsset(row: {
  id: number;
  contentType: string;
  sizeBytes: bigint;
  durationMs: bigint | null;
  status: "PENDING" | "READY" | "FAILED" | "DELETED";
  uploadedAt: Date | null;
}) {
  return {
    id: row.id,
    status: row.status,
    contentType: row.contentType,
    sizeBytes: toSafeNumber(row.sizeBytes),
    durationMs: row.durationMs === null ? null : toSafeNumber(row.durationMs),
    uploadedAt: row.uploadedAt?.toISOString() ?? null,
  };
}

export function toLessonAudio(row: {
  id: number;
  lessonId: number;
  languageCode: string;
  audioVersion: number;
  isCurrent: boolean;
  createdAt: Date;
}) {
  return {
    id: row.id,
    lessonId: row.lessonId,
    languageCode: row.languageCode,
    audioVersion: row.audioVersion,
    isCurrent: row.isCurrent,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSafeNumber(value: bigint) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error("Database value is not safe for JSON.");
  }
  return number;
}
