// The current Lesson Audio of one Language, read from the backend with a fresh Playback URL
// and played straight from storage. Errors stay in this panel. Playback URLs are refreshed
// only by Reload audio, never in the background.
import {
  adminLessonAudioResponseSchema,
  type AdminLessonAudio,
} from "@ez-dk-citizen/api-contracts/schemas";
import { useEffect, useState } from "react";

import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import type { Call } from "../../../shared/lib/bff";
import type { AudioTarget } from "../types";
import { formatSize } from "../utils/formatSize";

export function CurrentAudio({
  call,
  target: { lessonId, languageCode },
  onLoaded,
}: {
  call: Call;
  target: AudioTarget;
  onLoaded: (audio: AdminLessonAudio | null) => void;
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
        { method: "GET", path: `/api/admin/lessons/${lessonId}/audio/${languageCode}` },
        adminLessonAudioResponseSchema,
      );
      setAudio(current);
      onLoaded(current);
    } catch (caught) {
      setError(caught);
    }
  }

  useEffect(() => void load(), []);

  return (
    <section aria-label="Current audio">
      <h4>Current audio ({languageCode})</h4>
      {audio === undefined && error === null && <p>Loading audio…</p>}
      {audio === null && <p>No audio yet for this Language.</p>}
      {audio && (
        <>
          <p>
            Audio version {audio.audioVersion} · {audio.originalFilename} ·{" "}
            {formatSize(audio.sizeBytes)}
          </p>
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
          The audio could not be played. Its Playback URL may have expired; use Reload audio.
        </p>
      )}
      {error !== null && <ErrorMessage error={error} />}
      <button type="button" onClick={load}>
        Reload audio
      </button>
    </section>
  );
}
