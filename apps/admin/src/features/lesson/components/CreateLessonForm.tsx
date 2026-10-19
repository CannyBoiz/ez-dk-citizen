// The form behind Create draft: it asks for the chapter and says where that chapter stands, and
// nothing reaches the Backend until the admin confirms.
import type { LessonSummary } from "@ez-dk-citizen/api-contracts/schemas";
import { useEffect, useRef } from "react";

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
  lessons,
  value,
  onChange,
  onCreate,
  onClose,
}: {
  // The Lesson list the chapter's standing is read from; null until it is loaded.
  lessons: LessonSummary[] | null;
  // What the admin has typed, held by the caller.
  value: Values;
  onChange: (value: Values) => void;
  // Creates the Lesson once the admin confirms; a refusal is shown in the form.
  onCreate: (chapter: number) => Promise<void>;
  // Cancel, once nothing typed is left to lose or the admin agreed to discard it.
  onClose: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);

  // Starts on the chapter field, as the admin opened the form to fill it in.
  useEffect(() => form.current?.querySelector("input")?.focus(), []);

  return (
    <EditForm
      ref={form}
      name="New Draft"
      fields={[chapterField]}
      value={value}
      onChange={onChange}
      submitLabel="Create draft"
      confirmMessage={`Create a new Draft of chapter ${value.chapter}?`}
      onSave={({ chapter }) => onCreate(Number(chapter))}
      onCancel={onClose}
      cancelMessage={
        value.chapter?.trim()
          ? "Discard the chapter entered for this new Draft?"
          : null
      }
    >
      {/* Always rendered, so screen readers announce it as the chapter changes. */}
      <p role="status">{standing(lessons, value.chapter)}</p>
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
