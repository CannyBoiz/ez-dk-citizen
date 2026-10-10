// The publication checklist and the lifecycle actions. The checklist mirrors the backend's
// publication prerequisites; the backend stays the authority, and its refusals are shown.
// Replacing a Published version is two separate actions: archive it, then publish the Draft.
import {
  type LessonDetail,
  type LessonStatus,
  lessonDetailSchema,
  type PatchLessonRequest,
} from "@ez-dk-citizen/api-contracts/schemas";

import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import { BffError, type Call } from "../../../shared/lib/bff";
import { useAction } from "../../../shared/lib/useAction";
import { hasLessonText } from "../utils/lessonTexts";

const archiveWarning =
  "Archive this Lesson? Archiving is terminal: the Lesson becomes read-only and can never be " +
  "published again. A Published Lesson is also removed from the learner catalogue.";

export function Publication({
  call,
  lesson,
  dirty,
  busy,
  onChange,
}: {
  call: Call;
  lesson: LessonDetail;
  // Publish waits for every edit to be saved; both actions wait for an upload or detach in progress.
  dirty: boolean;
  busy: boolean;
  onChange: (lesson: LessonDetail) => void;
}) {
  const transitioning = useAction<LessonStatus>();
  const saved = (state: boolean) => (state ? "Saved" : "Missing");
  const failure = transitioning.failure?.error;

  function transition(status: LessonStatus) {
    void transitioning.run(status, async () =>
      onChange(
        await call(
          {
            method: "PATCH",
            path: `/api/admin/lessons/${lesson.id}`,
            body: { status } satisfies PatchLessonRequest,
          },
          lessonDetailSchema,
        ),
      ),
    );
  }

  const waiting = busy || transitioning.pending !== null;
  const confirmArchive = () =>
    window.confirm(
      dirty
        ? `${archiveWarning} Unsaved changes on this Lesson will be discarded.`
        : archiveWarning,
    );
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
        <button
          type="button"
          className="primary"
          disabled={dirty || waiting}
          onClick={() => transition("PUBLISHED")}
        >
          Publish
        </button>
      )}
      {lesson.status !== "ARCHIVED" && (
        <button
          type="button"
          className="danger"
          disabled={waiting}
          onClick={() => confirmArchive() && transition("ARCHIVED")}
        >
          Archive
        </button>
      )}
      {failure !== undefined && (
        <ErrorMessage error={failure}>
          {/* A refused publication lists each unmet prerequisite. */}
          {failure instanceof BffError && !!failure.errors?.length && (
            <ul>
              {failure.errors.map((entry) => (
                <li key={entry.path.join(".")}>{entry.message}</li>
              ))}
            </ul>
          )}
        </ErrorMessage>
      )}
    </section>
  );
}
