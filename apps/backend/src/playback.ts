import type { RequestIdEnvironment } from "@ez-dk-citizen/api-contracts";
import type { Context } from "hono";

import { problem } from "./errors/problem-details.js";
import { logStorageFailure, storageFailureProblem } from "./errors/storage.js";
import type { Storage } from "./storage.js";

// Signs a fresh Playback URL for current Lesson Audio. On failure it logs without secrets
// and returns the storage problem response for the route to send.
export async function authorizePlayback(
  c: Context<RequestIdEnvironment>,
  storage: Storage | undefined,
  audio: { mediaAssetId: number; objectKey: string },
): Promise<{ playbackUrl: string; playbackExpiresAt: string } | Response> {
  if (!storage)
    return problem(c, 502, "storage_unavailable", "Storage is unavailable.");
  try {
    const { playbackUrl, expiresAt } =
      await storage.createPlaybackAuthorization(audio.objectKey);
    return { playbackUrl, playbackExpiresAt: expiresAt };
  } catch (error) {
    logStorageFailure(
      c.get("requestId"),
      "playback",
      audio.mediaAssetId,
      error,
    );
    return storageFailureProblem(c, error, false);
  }
}
