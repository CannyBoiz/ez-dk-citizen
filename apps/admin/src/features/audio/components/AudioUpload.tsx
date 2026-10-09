// Uploading an MP3 as the next rendition for one Lesson and Language: Upload Intent, a direct
// PUT to storage with progress, then completion. Success is shown only after completion. A
// failure is recovered, where it can be, by completing the same Media Asset again; only the
// explicit Start new upload begins another Upload Intent.
import {
  type CompleteMediaAssetRequest,
  type CreateUploadIntentRequest,
  completeMediaAssetResponseSchema,
  maxUploadSizeBytes,
  type UploadIntentResponse,
  uploadIntentResponseSchema,
} from "@ez-dk-citizen/api-contracts/schemas";
import { useEffect, useRef, useState } from "react";

import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import { BffError, type Call } from "../../../shared/lib/bff";
import { type Network, StorageError } from "../../../shared/lib/network";
import type { AudioTarget } from "../types";

// One upload attempt: fixed to the Lesson and Language it started for, whatever is selected later.
type Attempt = { target: AudioTarget; filename: string };
// An attempt that holds a Media Asset ID, which every recovery reuses.
type Started = Attempt & { mediaAssetId: number };
// Retryable: the file reached storage but completion failed transiently. Uncertain: the PUT
// failed, so whether the file reached storage is unknown until completion checks it.
type Recovery = "retryable" | "uncertain";
type UploadState =
  | { step: "idle" }
  | ({ step: "preparing" } & Attempt)
  | ({ step: "uploading"; percent: number } & Started)
  | ({ step: "finalizing" } & Started)
  | ({ step: "complete"; audioVersion: number } & Started)
  | ({ step: "failed"; error: unknown; kind: Recovery } & Started)
  | ({ step: "failed"; error: unknown; kind: "terminal" } & Attempt & {
        mediaAssetId?: number;
      });

// While an attempt is in one of these steps, its Lesson and Language stay locked.
const isActive = ({ step }: UploadState) =>
  step === "preparing" || step === "uploading" || step === "finalizing";

// What leaving the page would lose: an attempt in progress, a failed attempt that can still
// be recovered, or nothing. "idle" means nothing to lose, so it also covers a completed attempt
// and a terminal failure, not only an upload that has not started.
export type UploadStatus = "active" | "recoverable" | "idle";
const statusOf = (state: UploadState): UploadStatus =>
  isActive(state)
    ? "active"
    : state.step === "failed" && state.kind !== "terminal"
      ? "recoverable"
      : "idle";

// Each failure kind's explanation and its way forward. While recovery can still succeed, Start
// new upload is offered beside it, so a backend that keeps failing never traps the admin.
const failureKinds = {
  retryable: {
    help: "The file reached storage but was not finalized. Retry finalization to make it current.",
    action: "Retry finalization",
  },
  uncertain: {
    help: "It is not known whether the file reached storage. Check the upload to find out.",
    action: "Check upload / Retry finalization",
  },
  terminal: { help: "A new upload is required." },
} satisfies Record<Recovery, { help: string; action: string }> & {
  terminal: { help: string };
};

// A completion failure that a retry may get past: the BFF unreachable, failing upstream, or
// answering unreadably, or the token rejected (re-entered before retrying). Any other 4xx is a
// refusal that is final for the attempt.
const isTransient = (error: unknown) =>
  !(error instanceof BffError) ||
  error.status === undefined ||
  error.status === 401 ||
  error.status < 400 ||
  error.status >= 500;

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
  onStatusChange,
  onComplete,
}: {
  call: Call;
  putObject: Network["putObject"];
  // The selected Lesson and Language, which the next attempt will target.
  target: AudioTarget;
  // Why uploading is not possible right now, if it is not.
  unavailable?: string;
  onStatusChange: (status: UploadStatus) => void;
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
    onStatusChange(statusOf(next));
  }

  function clearFile() {
    setFile(null);
    setFileError(undefined);
    if (input.current) input.current.value = "";
  }

  // A file chosen for one Language is never uploaded to another. A failed attempt stays shown.
  // Runs only when the Language changes; clearFile only resets state and the input.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on Language
  useEffect(() => {
    clearFile();
    setState((current) =>
      current.step === "complete" ? { step: "idle" } : current,
    );
  }, [target.languageCode]);

  function choose(chosen: File | undefined) {
    const problem = chosen && fileProblem(chosen);
    setFileError(problem);
    setFile(chosen && !problem ? chosen : null);
  }

  async function upload(chosen: File) {
    const attempt: Attempt = { target, filename: chosen.name };
    step({ step: "preparing", ...attempt });
    let intent: UploadIntentResponse;
    try {
      intent = await call(
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
    } catch (error) {
      step({ step: "failed", error, kind: "terminal", ...attempt });
      return;
    }

    const started: Started = { ...attempt, mediaAssetId: intent.mediaAssetId };
    step({ step: "uploading", percent: 0, ...started });
    // The browser derives Content-Length from the File; scripts cannot set it.
    const { "Content-Length": _contentLength, ...headers } =
      intent.uploadHeaders;
    const { status } = await putObject({
      url: intent.uploadUrl,
      headers,
      file: chosen,
      onProgress: (fraction) =>
        setState({
          step: "uploading",
          percent: Math.round(fraction * 100),
          ...started,
        }),
    }).catch(() => ({ status: undefined }));
    if (status === undefined || status < 200 || status > 299) {
      step({
        step: "failed",
        error: new StorageError(
          status === undefined
            ? "The upload to storage did not complete."
            : `Storage rejected the upload with status ${status}.`,
        ),
        kind: "uncertain",
        ...started,
      });
      return;
    }
    await finalize(started, "retryable");
  }

  // Completion with the attempt's own Media Asset ID and target, never a new Upload Intent. A
  // transient failure leaves the attempt recoverable as `recovery`; any other is terminal.
  async function finalize(
    { target, filename, mediaAssetId }: Started,
    recovery: Recovery,
  ) {
    // Only the attempt itself, without a failed state's step, kind, or error. Its target, not
    // the selected one.
    const started = { target, filename, mediaAssetId };
    step({ step: "finalizing", ...started });
    try {
      const { lessonAudio } = await call(
        {
          method: "POST",
          path: `/api/admin/media/${mediaAssetId}/complete`,
          body: target satisfies CompleteMediaAssetRequest,
        },
        completeMediaAssetResponseSchema,
      );
      step({
        step: "complete",
        audioVersion: lessonAudio.audioVersion,
        ...started,
      });
      clearFile();
      onComplete(target);
    } catch (error) {
      step({
        step: "failed",
        error,
        kind: isTransient(error) ? recovery : "terminal",
        ...started,
      });
    }
  }

  function startNewUpload() {
    clearFile();
    step({ step: "idle" });
  }

  const failed = state.step === "failed";
  // Once an attempt has started, the panel is about that attempt and its Language.
  const shown = "target" in state ? state.target : target;
  return (
    <section aria-label="Upload audio">
      <h4>Upload audio ({shown.languageCode})</h4>
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
          <progress
            aria-label="Upload progress"
            max={100}
            value={state.percent}
          />
        </>
      )}
      {state.step === "finalizing" && (
        <p role="status">Finalizing the upload…</p>
      )}
      {state.step === "complete" && (
        <p role="status">
          Upload complete: audio version {state.audioVersion} is now current.
        </p>
      )}
      {failed && (
        <>
          <ErrorMessage
            error={state.error}
            context={
              `Upload of ${state.filename} for ${state.target.languageCode} failed` +
              (state.mediaAssetId ? ` (Media Asset ${state.mediaAssetId})` : "")
            }
          >
            {" "}
            {failureKinds[state.kind].help}
          </ErrorMessage>
          {state.kind !== "terminal" && (
            <button type="button" onClick={() => finalize(state, state.kind)}>
              {failureKinds[state.kind].action}
            </button>
          )}
          <button type="button" onClick={startNewUpload}>
            Start new upload
          </button>
        </>
      )}
    </section>
  );
}
