import type { DataServiceClient } from "../data-service/client.js";

export function createTestDataServiceClient(
  overrides: Partial<DataServiceClient>,
): DataServiceClient {
  const unused = async (): Promise<never> => {
    throw new Error("not used");
  };
  return {
    createPendingMediaAsset: unused,
    getMediaAsset: unused,
    failMediaAsset: unused,
    completeMediaAsset: unused,
    createLesson: unused,
    upsertLessonText: unused,
    listLessons: unused,
    getLesson: unused,
    patchLesson: unused,
    createSource: unused,
    listSources: unused,
    upsertLessonSource: unused,
    deleteLessonSource: unused,
    listPublishedLessons: unused,
    getPublishedLesson: unused,
    getCurrentLessonAudio: unused,
    ...overrides,
  };
}
