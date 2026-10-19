// The form behind Create draft and Create new version: it asks for the chapter, or shows the
// fixed chapter of a new version, and nothing reaches the Backend until the admin confirms.
import type { LessonSummary } from "@ez-dk-citizen/api-contracts/schemas";
import { type ReactNode, useEffect, useRef } from "react";

import {
  EditForm,
  type Field,
  fieldProblem,
  type Values,
} from "../../../shared/components/EditForm";
import { statusLabels } from "../utils/statusLabels";
import { highestVersionLesson, versionLabel } from "../utils/versions";

const chapterField: Field = {
  name: "chapter",
  label: "Chapter",
  kind: "number",
};

export function CreateLessonForm({
  lessons = null,
  value = {},
  onChange = () => undefined,
  onCreate,
  onClose,
  fixedChapter,
  name = "New Draft",
  submitLabel = "Create draft",
  confirmMessage = `Create a new Draft of chapter ${value.chapter}?`,
  children,
}: {
  // The Lesson list the typed chapter's standing is read from; null until it is loaded.
  lessons?: LessonSummary[] | null;
  // What the admin has typed, held by the caller.
  value?: Values;
  onChange?: (value: Values) => void;
  // Creates the Lesson once the admin confirms; a refusal is shown in the form.
  onCreate: (chapter: number) => Promise<void>;
  // Cancel, once nothing typed is left to lose or the admin agreed to discard it.
  onClose: () => void;
  // A new version's chapter, which it keeps from the Lesson it copies: shown, never typed.
  fixedChapter?: number;
  name?: string;
  submitLabel?: string;
  confirmMessage?: string;
  // Shown below the chapter, such as what a new version copies.
  children?: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);

  // Starts on the first control the admin can use: the chapter, or else the submit.
  useEffect(
    () =>
      form.current
        ?.querySelector<HTMLElement>("input:not([readonly]), button")
        ?.focus(),
    [],
  );

  return (
    <EditForm
      ref={form}
      name={name}
      fields={fixedChapter === undefined ? [chapterField] : []}
      value={value}
      onChange={onChange}
      submitLabel={submitLabel}
      confirmMessage={confirmMessage}
      onSave={({ chapter }) => onCreate(fixedChapter ?? Number(chapter))}
      onCancel={onClose}
      cancelMessage={
        value.chapter?.trim()
          ? "Discard the chapter entered for this new Draft?"
          : null
      }
    >
      {fixedChapter === undefined ? (
        // Always rendered, so screen readers announce it as the chapter changes.
        <p role="status">{standing(lessons, value.chapter)}</p>
      ) : (
        <label>
          Chapter
          <input type="number" value={fixedChapter} readOnly />
        </label>
      )}
      {children}
    </EditForm>
  );
}

// The chapter's highest Published or Archived version and that Lesson's status, once a valid
// chapter is typed and the Lesson list is loaded.
function standing(lessons: LessonSummary[] | null, chapter = "") {
  if (lessons === null || fieldProblem(chapterField, chapter)) return "";
  const latest = highestVersionLesson(lessons, Number(chapter));
  return latest
    ? `Chapter ${chapter}'s latest version is ${versionLabel(latest)}, ${statusLabels[latest.status]}.`
    : `Chapter ${chapter} has no Published or Archived version yet.`;
}
