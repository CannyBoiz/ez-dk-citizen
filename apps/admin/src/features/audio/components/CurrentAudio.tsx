// The current Lesson Audio of one Language, read from the backend with a fresh Playback URL
// and played straight from storage. Errors stay in this panel. Playback URLs are refreshed
// only by Reload audio, never in the background.
import {
  type AdminLessonAudio,
  adminLessonAudioResponseSchema,
} from "@ez-dk-citizen/api-contracts/schemas";
import { useEffect, useState } from "react";

import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import type { Call } from "../../../shared/lib/bff";
import type { AudioTarget } from "../types";
import { formatSize } from "../utils/formatSize";

export function CurrentAudio({
  call,
  target: { lessonId, languageCode },
  onRead,
}: {
  call: Call;
  target: AudioTarget;
  // The current audio, null when there is none, or undefined when the read failed.
  onRead: (audio: AdminLessonAudio | null | undefined) => void;
}) {
  // undefined until the first read settles; null when the Language has no current audio.
  const [audio, setAudio] = useState<AdminLessonAudio | null>();
  const [error, setError] = useState<unknown>(null);
  const [playbackFailed, setPlaybackFailed] = useState(false);

  async function load() {
    setError(null);
    setPlaybackFailed(false);
    try {
      const { audio: current } = await call(
        {
          method: "GET",
          path: `/api/admin/lessons/${lessonId}/audio/${languageCode}`,
        },
        adminLessonAudioResponseSchema,
      );
      setAudio(current);
      onRead(current);
    } catch (caught) {
      setError(caught);
      onRead(undefined);
    }
  }

  // Reads once on mount: LessonView remounts this panel by key for another Language or a new
  // upload.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
  useEffect(() => void load(), []);

  return (
    <section className="card" aria-label="Current audio">
      <h4>Current audio ({languageCode})</h4>
      {audio === undefined && error === null && <p>Loading audio…</p>}
      {audio === null && <p>No audio yet for this Language.</p>}
      {audio && (
        <>
          <p>
            Audio version {audio.audioVersion} · {audio.originalFilename} ·{" "}
            {formatSize(audio.sizeBytes)}
          </p>
          {/* Narration of the Lesson Text, which is its transcript. */}
          {/* biome-ignore lint/a11y/useMediaCaption: transcript */}
          <audio
            controls
            preload="none"
            src={audio.playbackUrl}
            aria-label="Current audio player"
            onError={() => setPlaybackFailed(true)}
          />
        </>
      )}
      {playbackFailed && (
        <p role="alert">
          The audio could not be played. Its Playback URL may have expired; use
          Reload audio.
        </p>
      )}
      {error !== null && <ErrorMessage error={error} />}
      <button type="button" onClick={load}>
        Reload audio
      </button>
    </section>
  );
}
