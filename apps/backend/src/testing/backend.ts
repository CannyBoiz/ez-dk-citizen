import assert from "node:assert/strict";
import { after } from "node:test";
import {
  type CompleteMediaAssetResponse,
  type LessonDetail,
  type ProblemDetails,
  uploadIntentResponseSchema,
} from "@ez-dk-citizen/api-contracts";
import { createDataModule } from "@ez-dk-citizen/data";
import { resetDatabaseBetweenTests } from "@ez-dk-citizen/data/testing";

import { createBackendApp } from "../app.js";
import { FakeStorage } from "../storage.js";

// The Backend on the real data module and FakeStorage, for integration tests against
// PostgreSQL. Each test starts from an empty database.
export function useBackend() {
  resetDatabaseBetweenTests();
  const data = createDataModule(String(process.env.DATABASE_URL), 2_000);
  after(() => data.close());
  const storage = new FakeStorage();
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    data,
    storage,
    storageBucket: "citizenship-audio",
  });
  const request = (path: string, method = "GET", body?: unknown) =>
    app.request(`/api/admin${path}`, {
      method,
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const read = async (id: number): Promise<LessonDetail> =>
    (await request(`/lessons/${id}`)).json();
  const inStorage = (objectKey: string) =>
    storage.inspectObject(objectKey).then(
      () => true,
      () => false,
    );
  const createLesson = async (chapter: number): Promise<LessonDetail> => {
    const response = await request("/lessons", "POST", { chapter });
    assert.equal(response.status, 201);
    return response.json();
  };
  // Requests an Upload Intent for a one-byte MP3; nothing is stored yet.
  const requestUpload = async (
    lessonId: number,
    languageCode: string,
    originalFilename = "lesson.mp3",
  ) => {
    const response = await request("/media/upload-intents", "POST", {
      lessonId,
      languageCode,
      originalFilename,
      contentType: "audio/mpeg",
      sizeBytes: 1,
    });
    assert.equal(response.status, 201);
    const intent = uploadIntentResponseSchema.parse(await response.json());
    const upload = storage.uploads.at(-1);
    assert.ok(upload);
    return { id: intent.mediaAssetId, objectKey: upload.key };
  };
  const complete = (id: number, lessonId: number, languageCode: string) =>
    request(`/media/${id}/complete`, "POST", { lessonId, languageCode });
  // The whole upload: an Upload Intent, a matching stored object, and completion.
  const upload = async (
    lessonId: number,
    languageCode: string,
    originalFilename?: string,
  ) => {
    const asset = await requestUpload(lessonId, languageCode, originalFilename);
    storage.putObject(asset.objectKey, {
      contentType: "audio/mpeg",
      sizeBytes: 1,
    });
    const response = await complete(asset.id, lessonId, languageCode);
    assert.equal(response.status, 200);
    const completion: CompleteMediaAssetResponse = await response.json();
    return { ...asset, completion };
  };

  return {
    app,
    data,
    storage,
    request,
    read,
    inStorage,
    createLesson,
    requestUpload,
    complete,
    upload,
  };
}

export async function code(response: Response) {
  return ((await response.json()) as ProblemDetails).code;
}
