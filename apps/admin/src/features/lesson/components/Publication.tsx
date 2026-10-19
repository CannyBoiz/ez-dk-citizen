// The publication checklist and the lifecycle actions: Publish and Delete on a Draft, Archive on
// a Published Lesson. The checklist mirrors the backend's publication prerequisites; the
// backend stays the authority, and its refusals are shown.
// Publishing asks in the page which version the Draft becomes, from the chapter's versions as
// the backend holds them then. When the chapter has a Published Lesson, publishing replaces it:
// the backend archives it in the same step, and only if it is the one the confirmation named.
// The editor reads the Lesson list when it opens too, so Publish already reads Replace.
import {
  type ChangeKind,
  changeKindSchema,
  type LessonDetail,
  type LessonSummary,
  lessonDetailSchema,
  lessonListResponseSchema,
  type PatchLessonRequest,
} from "@ez-dk-citizen/api-contracts/schemas";
import { useEffect, useId, useRef, useState } from "react";

import { ConfirmButton } from "../../../shared/components/ConfirmButton";
import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import { BackendError, type Call } from "../../../shared/lib/backend";
import { useAction } from "../../../shared/lib/useAction";
import { hasLessonText } from "../utils/lessonTexts";
import {
  changeKindLabels,
  formatVersion,
  highestVersion,
  lessonVersion,
  raiseVersion,
} from "../utils/versions";

const archiveWarning =
  "Archive this Lesson? Archiving is terminal: the Lesson becomes read-only and can never be " +
  "published again. It is also removed from the learner catalogue.";
const deleteWarning =
  "Delete this Draft? Its Lesson Texts, Lesson Source references, and Lesson Audio will be " +
  "lost. Canonical Sources stay. Deleting cannot be undone.";

// The Lesson list as last read, when the editor opened or the publish confirmation last did.
type LessonsRead =
  | { state: "reading" }
  | { state: "failed"; error: unknown }
  | { state: "read"; items: LessonSummary[] };

export function Publication({
  call,
  writeCall,
  lesson,
  dirty,
  busy,
  onChange,
  onDelete,
}: {
  call: Call;
  // `call` for changing the Lesson.
  writeCall: Call;
  lesson: LessonDetail;
  // Publish waits for every edit to be saved; every action waits for an upload or detach in progress.
  dirty: boolean;
  busy: boolean;
  onChange: (lesson: LessonDetail) => void;
  onDelete: () => void;
}) {
  const archiving = useAction<"archive">();
  const [listed, setListed] = useState<LessonsRead>({ state: "reading" });
  const [changeKind, setChangeKind] = useState<ChangeKind | null>(null);
  // Only the latest read may answer, if the confirmation is reopened while one is in flight.
  const reads = useRef(0);
  const choiceName = useId();
  const saved = (state: boolean) => (state ? "Saved" : "Missing");

  async function readLessons() {
    const read = ++reads.current;
    setListed({ state: "reading" });
    setChangeKind(null);
    try {
      const { items } = await call(
        { method: "GET", path: "/api/admin/lessons" },
        lessonListResponseSchema,
      );
      if (read === reads.current) setListed({ state: "read", items });
    } catch (error) {
      if (read === reads.current) setListed({ state: "failed", error });
    }
  }

  // Only a Draft publishes. Opening the confirmation reads again, and that read decides.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
  useEffect(() => {
    if (lesson.status === "DRAFT") void readLessons();
  }, []);

  // The backend gives the version. A kind is chosen only when the chapter already has one.
  async function publish(replaced: LessonSummary | undefined) {
    try {
      onChange(
        await writeCall(
          {
            method: "PATCH",
            path: `/api/admin/lessons/${lesson.id}`,
            body: {
              status: "PUBLISHED",
              ...(changeKind && { changeKind }),
              ...(replaced && { replacesLessonId: replaced.id }),
            } satisfies PatchLessonRequest,
          },
          lessonDetailSchema,
        ),
      );
    } catch (error) {
      // The chapter's versions changed after the confirmation read them: read again, so the
      // choice the backend asks for, or the Published version it would replace, appears
      // beside its refusal.
      if (
        error instanceof BackendError &&
        (error.code === "published_lesson_conflict" ||
          error.errors?.some((entry) => entry.path[0] === "changeKind"))
      )
        void readLessons();
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

  async function deleteDraft() {
    await writeCall(
      { method: "DELETE", path: `/api/admin/lessons/${lesson.id}` },
      { parse: () => undefined },
    );
    onDelete();
  }

  // Counted from the Draft's chapter as it is now, which a tab's Save may have changed.
  const items = listed.state === "read" ? listed.items : undefined;
  const highest = items && highestVersion(items, lesson.chapter);
  // The chapter's Published Lesson, which publishing replaces.
  const published = items?.find(
    (other) => other.chapter === lesson.chapter && other.status === "PUBLISHED",
  );
  const replacedVersion = published && lessonVersion(published);
  const publishMessage =
    listed.state === "reading"
      ? "Reading this chapter's versions…"
      : listed.state === "failed"
        ? "Could not read this chapter's versions."
        : replacedVersion && highest
          ? `Archive version ${formatVersion(replacedVersion)} and publish this Draft as ${changeKind ? formatVersion(raiseVersion(highest, changeKind)) : "a content change or a fix"}?`
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
          Publishing, archiving, and deleting wait until the upload or detach in
          progress finishes.
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
            listed.state === "failed" ? (
              <ErrorMessage
                error={listed.error}
                onRetry={() => void readLessons()}
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
          confirmLabel={published ? "Replace" : "Publish"}
          confirmDisabled={
            listed.state !== "read" ||
            (highest !== undefined && changeKind === null)
          }
          onOpen={() => void readLessons()}
          onConfirm={() => publish(published)}
        >
          {published ? "Replace" : "Publish"}
        </ConfirmButton>
      )}
      {lesson.status === "DRAFT" && (
        <ConfirmButton
          className="danger"
          disabled={waiting}
          message={deleteWarning}
          confirmLabel="Delete"
          onConfirm={deleteDraft}
        >
          Delete
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
