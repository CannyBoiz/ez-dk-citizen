// The publication checklist and the lifecycle actions. The checklist mirrors the backend's
// publication prerequisites; the backend stays the authority, and its refusals are shown.
// Publishing asks in the page which version the Draft becomes, from the chapter's versions as
// the backend holds them then. Replacing a Published version is two separate actions: archive
// it, then publish the Draft.
import {
  type ChangeKind,
  changeKindSchema,
  type LessonDetail,
  lessonDetailSchema,
  lessonListResponseSchema,
  type PatchLessonRequest,
} from "@ez-dk-citizen/api-contracts/schemas";
import { useId, useRef, useState } from "react";

import { ConfirmButton } from "../../../shared/components/ConfirmButton";
import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import { BffError, type Call } from "../../../shared/lib/bff";
import { useAction } from "../../../shared/lib/useAction";
import { hasLessonText } from "../utils/lessonTexts";
import {
  changeKindLabels,
  formatVersion,
  highestVersion,
  raiseVersion,
} from "../utils/versions";

const archiveWarning =
  "Archive this Lesson? Archiving is terminal: the Lesson becomes read-only and can never be " +
  "published again. It is also removed from the learner catalogue.";

// The chapter's versions as last read for the publish confirmation.
type VersionsRead =
  | { state: "reading" }
  | { state: "failed"; error: unknown }
  | { state: "read"; highest: ReturnType<typeof highestVersion> };

export function Publication({
  call,
  writeCall,
  lesson,
  dirty,
  busy,
  onChange,
}: {
  call: Call;
  // `call` for changing the Lesson.
  writeCall: Call;
  lesson: LessonDetail;
  // Publish waits for every edit to be saved; both actions wait for an upload or detach in progress.
  dirty: boolean;
  busy: boolean;
  onChange: (lesson: LessonDetail) => void;
}) {
  const archiving = useAction<"archive">();
  const [versions, setVersions] = useState<VersionsRead>({ state: "reading" });
  const [changeKind, setChangeKind] = useState<ChangeKind | null>(null);
  // Only the latest read may answer, if the confirmation is reopened while one is in flight.
  const reads = useRef(0);
  const choiceName = useId();
  const saved = (state: boolean) => (state ? "Saved" : "Missing");

  async function readVersions() {
    const read = ++reads.current;
    setVersions({ state: "reading" });
    setChangeKind(null);
    try {
      const { items } = await call(
        { method: "GET", path: "/api/admin/lessons" },
        lessonListResponseSchema,
      );
      if (read === reads.current)
        setVersions({
          state: "read",
          highest: highestVersion(items, lesson.chapter),
        });
    } catch (error) {
      if (read === reads.current) setVersions({ state: "failed", error });
    }
  }

  // The backend gives the version. A kind is chosen only when the chapter already has one.
  async function publish() {
    try {
      onChange(
        await writeCall(
          {
            method: "PATCH",
            path: `/api/admin/lessons/${lesson.id}`,
            body: {
              status: "PUBLISHED",
              ...(changeKind && { changeKind }),
            } satisfies PatchLessonRequest,
          },
          lessonDetailSchema,
        ),
      );
    } catch (error) {
      // The chapter gained a version after the confirmation read them: read again, so the
      // choice the backend asks for appears beside its refusal.
      if (
        error instanceof BffError &&
        error.errors?.some((entry) => entry.path[0] === "changeKind")
      )
        void readVersions();
      throw error;
    }
  }

  function archive() {
    void archiving.run("archive", async () =>
      onChange(
        await writeCall(
          {
            method: "PATCH",
            path: `/api/admin/lessons/${lesson.id}`,
            body: { status: "ARCHIVED" } satisfies PatchLessonRequest,
          },
          lessonDetailSchema,
        ),
      ),
    );
  }

  const highest = versions.state === "read" ? versions.highest : undefined;
  const publishMessage =
    versions.state === "reading"
      ? "Reading this chapter's versions…"
      : versions.state === "failed"
        ? "Could not read this chapter's versions."
        : highest
          ? `Publish this Draft as a content change or a fix? The chapter's highest version is ${formatVersion(highest)}.`
          : "Publish as version 1.0?";
  const waiting = busy || archiving.pending !== null;
  return (
    <section className="card" aria-label="Publication">
      <h3>Publication</h3>
      <ul>
        <li>
          Thai Lesson Text (required): {saved(hasLessonText(lesson, "th"))}
        </li>
        <li>
          Lesson Source (required): {saved(lesson.lessonSources.length > 0)}
        </li>
        <li>Thai audio (optional)</li>
        <li>Danish or English Lesson Text (optional)</li>
      </ul>
      {lesson.status === "ARCHIVED" && (
        <p>This Lesson is archived and read-only.</p>
      )}
      {busy && (
        <p>
          Publishing and archiving wait until the upload or detach in progress
          finishes.
        </p>
      )}
      {dirty && lesson.status === "DRAFT" && (
        <p>Save every change before publishing.</p>
      )}
      {lesson.status === "DRAFT" && (
        <ConfirmButton
          className="primary"
          disabled={dirty || waiting}
          message={publishMessage}
          details={
            versions.state === "failed" ? (
              <ErrorMessage
                error={versions.error}
                onRetry={() => void readVersions()}
              />
            ) : (
              highest && (
                <fieldset>
                  <legend>Kind of change</legend>
                  {changeKindSchema.options.map((kind) => (
                    <label key={kind}>
                      <input
                        type="radio"
                        name={choiceName}
                        checked={changeKind === kind}
                        onChange={() => setChangeKind(kind)}
                      />
                      {changeKindLabels[kind]} →{" "}
                      {formatVersion(raiseVersion(highest, kind))}
                    </label>
                  ))}
                </fieldset>
              )
            )
          }
          confirmLabel="Publish"
          confirmDisabled={
            versions.state !== "read" ||
            (highest !== undefined && changeKind === null)
          }
          onOpen={() => void readVersions()}
          onConfirm={publish}
        >
          Publish
        </ConfirmButton>
      )}
      {lesson.status === "PUBLISHED" && (
        <ConfirmButton
          className="danger"
          disabled={waiting}
          message={archiveWarning}
          confirmLabel="Archive"
          onConfirm={archive}
        >
          Archive
        </ConfirmButton>
      )}
      {archiving.failure && <ErrorMessage error={archiving.failure.error} />}
    </section>
  );
}
