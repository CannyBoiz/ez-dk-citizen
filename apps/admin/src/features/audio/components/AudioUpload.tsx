// Uploading an MP3 as the next rendition for one Lesson and Language: Upload Intent, a direct
// PUT to storage with progress, then completion. Success is shown only after completion, and
// after a failure only the explicit Start new upload begins another Upload Intent.
import {
  completeMediaAssetResponseSchema,
  maxUploadSizeBytes,
  uploadIntentResponseSchema,
  type CompleteMediaAssetRequest,
  type CreateUploadIntentRequest,
} from "@ez-dk-citizen/api-contracts/schemas";
import { useEffect, useRef, useState } from "react";

import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import type { Call } from "../../../shared/lib/bff";
import { StorageError, type Network } from "../../../shared/lib/network";
import type { AudioTarget } from "../types";

// One upload attempt: fixed to the Lesson and Language it started for, whatever is selected later.
type Attempt = { target: AudioTarget; filename: string; mediaAssetId?: number };
type UploadState =
  | { step: "idle" }
  | ({ step: "preparing" } & Attempt)
  | ({ step: "uploading"; percent: number } & Attempt)
  | ({ step: "finalizing" } & Attempt)
  | ({ step: "complete"; audioVersion: number } & Attempt)
  | ({ step: "failed"; error: unknown } & Attempt);

// While an attempt is in one of these steps, its Lesson and Language stay locked.
const isActive = ({ step }: UploadState) =>
  step === "preparing" || step === "uploading" || step === "finalizing";

function fileProblem(file: File) {
  if (!file.name.endsWith(".mp3")) return "Choose an .mp3 file.";
  if (file.size === 0) return "The file is empty.";
  if (file.size > maxUploadSizeBytes) return "The file is larger than 50 MiB.";
}

export function AudioUpload({
  call,
  putObject,
  target,
  unavailable,
  onActiveChange,
  onComplete,
}: {
  call: Call;
  putObject: Network["putObject"];
  // The selected Lesson and Language, which the next attempt will target.
  target: AudioTarget;
  // Why uploading is not possible right now, if it is not.
  unavailable?: string;
  onActiveChange: (active: boolean) => void;
  onComplete: (target: AudioTarget) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [state, setState] = useState<UploadState>({ step: "idle" });
  const input = useRef<HTMLInputElement>(null);
  const active = isActive(state);

  // Reported in the same update as the step, so the lock never lags behind the panel.
  function step(next: UploadState) {
    setState(next);
    onActiveChange(isActive(next));
  }

  useEffect(() => () => onActiveChange(false), []);

  function clearFile() {
    setFile(null);
    setFileError(undefined);
    if (input.current) input.current.value = "";
  }

  // A file chosen for one Language is never uploaded to another. A failed attempt stays shown.
  useEffect(() => {
    clearFile();
    setState((current) => (current.step === "complete" ? { step: "idle" } : current));
  }, [target.languageCode]);

  function choose(chosen: File | undefined) {
    const problem = chosen && fileProblem(chosen);
    setFileError(problem);
    setFile(chosen && !problem ? chosen : null);
  }

  async function upload(chosen: File) {
    const attempt: Attempt = { target, filename: chosen.name };
    step({ step: "preparing", ...attempt });
    try {
      const intent = await call(
        {
          method: "POST",
          path: "/api/admin/media/upload-intents",
          body: {
            ...target,
            originalFilename: chosen.name,
            // Always audio/mpeg for a .mp3, whatever type the operating system reports.
            contentType: "audio/mpeg",
            sizeBytes: chosen.size,
          } satisfies CreateUploadIntentRequest,
        },
        uploadIntentResponseSchema,
      );
      attempt.mediaAssetId = intent.mediaAssetId;
      step({ step: "uploading", percent: 0, ...attempt });
      // The browser derives Content-Length from the File; scripts cannot set it.
      const { "Content-Length": _contentLength, ...headers } = intent.uploadHeaders;
      const { status } = await putObject({
        url: intent.uploadUrl,
        headers,
        file: chosen,
        onProgress: (fraction) =>
          setState({ step: "uploading", percent: Math.round(fraction * 100), ...attempt }),
      }).catch(() => {
        throw new StorageError("The upload to storage did not complete.");
      });
      if (status < 200 || status > 299)
        throw new StorageError(`Storage rejected the upload with status ${status}.`);

      step({ step: "finalizing", ...attempt });
      const { lessonAudio } = await call(
        {
          method: "POST",
          path: `/api/admin/media/${intent.mediaAssetId}/complete`,
          body: attempt.target satisfies CompleteMediaAssetRequest,
        },
        completeMediaAssetResponseSchema,
      );
      step({ step: "complete", audioVersion: lessonAudio.audioVersion, ...attempt });
      clearFile();
      onComplete(attempt.target);
    } catch (error) {
      step({ step: "failed", error, ...attempt });
    }
  }

  function startNewUpload() {
    clearFile();
    step({ step: "idle" });
  }

  const failed = state.step === "failed";
  return (
    <section aria-label="Upload audio">
      <h4>Upload audio ({target.languageCode})</h4>
      {unavailable && <p>{unavailable}</p>}
      <label>
        MP3 file
        <input
          ref={input}
          type="file"
          accept=".mp3,audio/mpeg"
          disabled={!!unavailable || active || failed}
          onChange={(event) => choose(event.target.files?.[0])}
        />
      </label>
      {fileError && <p role="alert">{fileError}</p>}
      <button
        type="button"
        disabled={!file || !!unavailable || active || failed}
        onClick={() => file && upload(file)}
      >
        Upload
      </button>
      {state.step === "preparing" && (
        <p role="status">Preparing the upload of {state.filename}…</p>
      )}
      {state.step === "uploading" && (
        <>
          <p role="status">
            Uploading {state.filename}: {state.percent}%
          </p>
          <progress aria-label="Upload progress" max={100} value={state.percent} />
        </>
      )}
      {state.step === "finalizing" && <p role="status">Finalizing the upload…</p>}
      {state.step === "complete" && (
        <p role="status">Upload complete: audio version {state.audioVersion} is now current.</p>
      )}
      {failed && (
        <>
          <ErrorMessage
            error={state.error}
            context={
              `Upload of ${state.filename} for ${state.target.languageCode} failed` +
              (state.mediaAssetId ? ` (Media Asset ${state.mediaAssetId})` : "")
            }
          />
          <button type="button" onClick={startNewUpload}>
            Start new upload
          </button>
        </>
      )}
    </section>
  );
}
