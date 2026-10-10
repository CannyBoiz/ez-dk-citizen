import {
  adminLessonAudioResponseSchema,
  type CurrentLessonAudioResponse,
  lessonLanguageParamsSchema,
  type RequestIdEnvironment,
  validateRequest,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";

import type { BffAppOptions } from "../../app.js";
import { mapDataServiceError } from "../../errors/downstream.js";
import { problem } from "../../errors/problem-details.js";
import { authorizePlayback } from "../../playback.js";

// The current Lesson Audio for any Lesson status, with a fresh Playback URL. Unlike the
// mobile route, it serves Draft and Archived Lessons too.
export function createAdminLessonAudioRoutes(
  options: Pick<BffAppOptions, "dataServiceClient" | "storage">,
) {
  return new Hono<RequestIdEnvironment>().get(
    "/:lessonId/audio/:languageCode",
    validateRequest("param", lessonLanguageParamsSchema),
    async (c) => {
      const { lessonId, languageCode } = c.req.valid("param") as {
        lessonId: number;
        languageCode: string;
      };
      if (!options.dataServiceClient) {
        return problem(
          c,
          502,
          "data_service_unavailable",
          "The Data Service is unavailable.",
        );
      }
      let current: CurrentLessonAudioResponse;
      try {
        current = await options.dataServiceClient.getCurrentLessonAudio(
          lessonId,
          languageCode,
          c.get("requestId"),
        );
      } catch (error) {
        return mapDataServiceError(c, error);
      }

      c.header("Cache-Control", "no-store");
      if (!current.audio) return c.json({ audio: null });
      const { objectKey, ...audio } = current.audio;
      const playback = await authorizePlayback(c, options.storage, {
        mediaAssetId: audio.mediaAssetId,
        objectKey,
      });
      if (playback instanceof Response) return playback;
      return c.json(
        adminLessonAudioResponseSchema.parse({
          audio: { ...audio, ...playback },
        }),
      );
    },
  );
}
