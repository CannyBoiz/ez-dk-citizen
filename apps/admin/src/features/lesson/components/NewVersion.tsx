// Create new version on a Published or Archived Lesson: the create form with the chapter fixed,
// listing what the new Draft starts with. The Backend copies the Lesson Texts, the Lesson
// Sources with their references, and each Language's current audio, which the copy shares.
import {
  type CreateLessonRequest,
  type LessonDetail,
  lessonDetailSchema,
} from "@ez-dk-citizen/api-contracts/schemas";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";

import type { Call } from "../../../shared/lib/backend";
import {
  type LanguageCode,
  languageCodes,
} from "../../../shared/lib/languages";
import { hasLessonText } from "../utils/lessonTexts";
import { versionLabel } from "../utils/versions";
import { CreateLessonForm } from "./CreateLessonForm";

export function NewVersion({
  call,
  lesson,
  audioExists,
  disabled,
  discards,
  onOpen,
}: {
  call: Call;
  lesson: LessonDetail;
  // Whether a Language has current audio; undefined when it cannot be told.
  audioExists: (code: LanguageCode) => Promise<boolean | undefined>;
  disabled: boolean;
  // What opening the new version's editor discards of this one, said in the confirmation.
  discards: string | null;
  // Opens the new version's editor.
  onOpen: (lessonId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  // Whether each Language with a Lesson Text has current audio; undefined while checking.
  const [audio, setAudio] = useState<Map<LanguageCode, boolean | undefined>>();
  const opener = useRef<HTMLButtonElement>(null);
  const texts = languageCodes.filter((code) => hasLessonText(lesson, code));

  async function openForm() {
    setOpen(true);
    setAudio(undefined);
    const found = await Promise.all(texts.map(audioExists));
    setAudio(new Map(texts.map((code, index) => [code, found[index]])));
  }

  // Create new version comes back with focus. Synchronously, so it is in the page before it takes focus.
  function close() {
    flushSync(() => setOpen(false));
    opener.current?.focus();
  }

  if (!open)
    return (
      <button
        type="button"
        ref={opener}
        className="primary"
        disabled={disabled}
        onClick={() => void openForm()}
      >
        Create new version
      </button>
    );

  const withAudio = texts.filter((code) => audio?.get(code) === true);
  const unchecked = texts.filter(
    (code) => audio && audio.get(code) === undefined,
  );
  return (
    <CreateLessonForm
      fixedChapter={lesson.chapter}
      name="New version"
      submitLabel="Create new version"
      confirmMessage={[
        `Create a new Draft of chapter ${lesson.chapter}, copied from version ${versionLabel(lesson)}?`,
        discards,
      ]
        .filter(Boolean)
        .join(" ")}
      onCreate={async () => {
        const created = await call(
          {
            method: "POST",
            path: "/api/admin/lessons",
            body: { copyFromLessonId: lesson.id } satisfies CreateLessonRequest,
          },
          lessonDetailSchema,
        );
        onOpen(created.id);
      }}
      onClose={close}
    >
      <ul aria-label="What the new version copies">
        <li>Lesson Texts: {texts.join(", ") || "none"}</li>
        <li>Lesson Sources: {lesson.lessonSources.length}</li>
        <li>
          Current audio:{" "}
          {audio === undefined
            ? "checking…"
            : `${withAudio.join(", ") || "none"}${unchecked.length ? ` (could not check ${unchecked.join(", ")})` : ""}`}
        </li>
      </ul>
    </CreateLessonForm>
  );
}
