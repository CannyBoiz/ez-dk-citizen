import {
  adminLessonAudioResponseSchema,
  lessonLanguageParamsSchema,
} from "@ez-dk-citizen/api-contracts";
import type { DataModule } from "@ez-dk-citizen/data";
import { Hono } from "hono";

import type { BackendAppOptions } from "../../app.ts";
import { refuse } from "../../errors/problem-details.ts";
import type { RequestIdEnvironment } from "../../middleware/request-id.ts";
import { validateRequest } from "../../middleware/validation.ts";
import { authorizePlayback } from "../../playback.ts";

// The current Lesson Audio for any Lesson status, with a fresh Playback URL. Unlike the
// mobile route, it serves Draft and Archived Lessons too.
export function createAdminLessonAudioRoutes(
  data: DataModule,
  options: Pick<BackendAppOptions, "storage">,
) {
  return new Hono<RequestIdEnvironment>().get(
    "/:lessonId/audio/:languageCode",
    validateRequest("param", lessonLanguageParamsSchema),
    async (c) => {
      const { lessonId, languageCode } = c.req.valid("param");
      const current = await data.getCurrentLessonAudio(lessonId, languageCode);
      if (!current.ok) {
        return refuse(c, current.code);
      }

      c.header("Cache-Control", "no-store");
      if (!current.value.audio) return c.json({ audio: null });
      const { objectKey, ...audio } = current.value.audio;
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
