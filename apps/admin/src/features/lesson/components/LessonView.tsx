// The Lesson editor: the Draft's chapter and per-Language Lesson Text tabs, where each tab's
// Save sends the chapter with that Language's Lesson Text, and per-Source Lesson Source
// references saved separately, with their unsaved edits reported up for the navigation
// guards; the selected Language's audio; and publication.
import {
  adminLessonAudioResponseSchema,
  type LessonDetail,
  lessonDetailSchema,
  type PatchLessonRequest,
} from "@ez-dk-citizen/api-contracts/schemas";
import { useEffect, useId, useRef, useState } from "react";

import { ConfirmButton } from "../../../shared/components/ConfirmButton";
import {
  EditForm,
  type Field,
  type FieldErrors,
  fieldProblem,
  type Values,
} from "../../../shared/components/EditForm";
import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import { BffError, type Call } from "../../../shared/lib/bff";
import {
  type LanguageCode,
  languageCodes,
} from "../../../shared/lib/languages";
import type { BffRequest, Network } from "../../../shared/lib/network";
import { useAction } from "../../../shared/lib/useAction";
import { AudioUpload, CurrentAudio, type UploadStatus } from "../../audio";
import { SourceFinder, SourceLabel } from "../../source";
import { hasLessonText } from "../utils/lessonTexts";
import {
  noReferences,
  referenceFields,
  toReferenceRequest,
  toReferenceValues,
  validateReferences,
} from "../utils/references";
import { statusLabels } from "../utils/statusLabels";
import { lessonLabel } from "../utils/versions";
import { Publication } from "./Publication";

// Each Lesson Source's reference form is keyed by its Source ID.
type Form = "chapter" | LanguageCode | `source:${number}`;
const sourceForm = (sourceId: number): Form => `source:${sourceId}`;
const chapterField: Field = {
  name: "chapter",
  label: "Chapter",
  kind: "number",
};

export function LessonView({
  call,
  putObject,
  lessonId,
  onUnsavedChange,
  onUploadChange,
  onDelete,
}: {
  call: Call;
  putObject: Network["putObject"];
  lessonId: number;
  // Names the unsaved forms, in page order, for the navigation guards.
  onUnsavedChange: (forms: string[]) => void;
  onUploadChange: (status: UploadStatus) => void;
  // After the Draft is deleted, as there is nothing left to show.
  onDelete: () => void;
}) {
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Unsaved edits per form; a form without an entry shows what the backend holds.
  const [edits, setEdits] = useState<Partial<Record<Form, Values>>>({});
  const [languageCode, setLanguageCode] = useState<LanguageCode>("th");
  // The chapter's messages from the last tab Save, shown on the chapter field above the tabs.
  const [chapterErrors, setChapterErrors] = useState<FieldErrors>({});
  // The Source finder's unsaved forms, its Edit forms and New Source, count towards unsaved edits too.
  const [finderUnsaved, setFinderUnsaved] = useState<string[]>([]);
  const detaching = useAction<number>();
  // The upload's status, reported up for the navigation guards. While it is active (Uploading
  // or Finalizing), its Lesson and Language stay locked. Held here as well as in App, like
  // the unsaved forms: this page locks on it, and App warns on it.
  const [upload, setUpload] = useState<UploadStatus>("idle");
  const uploading = upload === "active";
  // Bumped after a completed upload, so the audio panel reads the new current rendition.
  const [audioReads, setAudioReads] = useState(0);
  // Whether each Language has current audio, as far as this page knows; drives the narration
  // warning. A ref, so checks that finish late read what is known by then.
  const hasAudio = useRef<Partial<Record<LanguageCode, boolean>>>({});
  // Lesson changes in flight. Each answers with the whole Lesson, ordered by applyLesson; a detach
  // answers with nothing to order, so it never overlaps them: Detach waits for these, and they
  // wait for a detach.
  const [writes, setWrites] = useState(0);
  // Per Language, shown after saving a Lesson Text whose Language has, or may have, current audio.
  const [narrationWarnings, setNarrationWarnings] = useState<
    Partial<Record<LanguageCode, { audioKnown: boolean }>>
  >({});
  const tabsId = useId();

  // Responses can arrive out of order, and the backend moves updatedAt forward on every change,
  // so a Lesson older than the one shown (say, a save answered after Archive) never replaces it.
  function applyLesson(next: LessonDetail) {
    setLesson((current) =>
      current && Date.parse(next.updatedAt) < Date.parse(current.updatedAt)
        ? current
        : next,
    );
  }

  // `call` for a Lesson change, counted in `writes`.
  async function writeCall<T>(
    request: Omit<BffRequest, "token">,
    schema: { parse(value: unknown): T },
  ) {
    setWrites((count) => count + 1);
    try {
      return await call(request, schema);
    } finally {
      setWrites((count) => count - 1);
    }
  }

  // Audio once seen is never forgotten, because the Admin cannot delete audio; a failed read
  // (undefined) only turns a remembered "no audio" into unknown.
  function learnAudio(code: LanguageCode, exists: boolean | undefined) {
    hasAudio.current[code] = hasAudio.current[code] || exists;
  }

  async function load() {
    setError(null);
    try {
      applyLesson(
        await call(
          { method: "GET", path: `/api/admin/lessons/${lessonId}` },
          lessonDetailSchema,
        ),
      );
    } catch (caught) {
      setError(caught);
    }
  }

  // Loads once on mount: Lessons open only from the catalogue, so each mounts afresh.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
  useEffect(() => void load(), []);

  const saved: Partial<Record<Form, Values>> = lesson
    ? {
        chapter: { chapter: String(lesson.chapter) },
        ...Object.fromEntries(
          languageCodes.map((code) => {
            const text = lesson.lessonTexts.find(
              (candidate) => candidate.languageCode === code,
            );
            return [
              code,
              { title: text?.title ?? "", content: text?.content ?? "" },
            ];
          }),
        ),
        ...Object.fromEntries(
          lesson.lessonSources.map((source) => [
            sourceForm(source.id),
            toReferenceValues(source),
          ]),
        ),
      }
    : {};
  const isDirty = (form: Form) =>
    Object.entries(edits[form] ?? {}).some(
      ([field, value]) => value !== saved[form]?.[field],
    );
  const unsaved = [
    isDirty("chapter") && "Chapter",
    ...languageCodes.map((code) => isDirty(code) && `Lesson Text (${code})`),
    ...(lesson?.lessonSources ?? []).map(
      (source) =>
        isDirty(sourceForm(source.id)) && `Lesson Source ${source.url}`,
    ),
    ...finderUnsaved,
  ].filter((form) => form !== false);
  const dirty = unsaved.length > 0;
  // A new array every render, so the report reruns on the names, not on the array.
  const unsavedNames = unsaved.join("\n");

  // biome-ignore lint/correctness/useExhaustiveDependencies: reruns when the names change
  useEffect(() => {
    onUnsavedChange(unsaved);
    return () => onUnsavedChange([]);
  }, [unsavedNames, onUnsavedChange]);

  useEffect(() => {
    onUploadChange(upload);
    return () => onUploadChange("idle");
  }, [upload, onUploadChange]);

  if (lesson === null)
    return (
      <section className="lesson">
        {error !== null && <ErrorMessage error={error} onRetry={load} />}
        {error === null && <p>Loading Lesson…</p>}
      </section>
    );

  const readOnly = lesson.status !== "DRAFT";
  const detachingNow = detaching.pending !== null;
  const formProps = (form: Form) => ({
    value: edits[form] ?? saved[form] ?? {},
    onChange: (value: Values) =>
      setEdits((current) => ({ ...current, [form]: value })),
    readOnly: readOnly || detachingNow,
  });
  const formState = (form: Form, exists: boolean) =>
    isDirty(form) ? "Unsaved" : exists ? "Saved" : "Missing";

  // Saves the submitted edits of one or more forms in one request.
  async function save(
    submitted: Partial<Record<Form, Values>>,
    request: Omit<BffRequest, "token">,
  ) {
    applyLesson(await writeCall(request, lessonDetailSchema));
    // Edits made while the save was in flight stay unsaved.
    setEdits((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([form, edit]) => edit !== submitted[form as Form],
        ),
      ),
    );
  }

  const chapterEdit = isDirty("chapter") ? edits.chapter : undefined;
  const isBlank = (text: Values) =>
    !text.title?.trim() && !text.content?.trim();

  // One Lesson command: the dirty chapter, if any, with this Language's Lesson Text, if dirty
  // and not entirely blank. Either both are saved or neither.
  async function saveTab(code: LanguageCode, submitted: Values) {
    const { title = "", content = "" } = submitted;
    const text =
      isDirty(code) && !isBlank(submitted)
        ? { languageCode: code, title, content }
        : undefined;
    if (!chapterEdit && !text) return;
    try {
      await save(
        { chapter: chapterEdit, [code]: text && submitted },
        {
          method: "PATCH",
          path: `/api/admin/lessons/${lesson!.id}`,
          body: {
            ...(chapterEdit && { chapter: Number(chapterEdit.chapter) }),
            ...(text && { text }),
          } satisfies PatchLessonRequest,
        },
      );
    } catch (caught) {
      const message =
        caught instanceof BffError
          ? caught.errors?.find((entry) => entry.path[0] === "chapter")?.message
          : undefined;
      setChapterErrors(message ? { chapter: message } : {});
      throw caught;
    }
    if (!text) return;
    // The audio stays current; the admin decides whether to replace it. The check runs after
    // the save settles, so it never holds the form.
    void currentAudioExists(code).then((exists) =>
      setNarrationWarnings((current) => ({
        ...current,
        [code]: exists === false ? undefined : { audioKnown: exists === true },
      })),
    );
  }

  function detach(sourceId: number) {
    const form = sourceForm(sourceId);
    void detaching.run(sourceId, async () => {
      await call(
        {
          method: "DELETE",
          path: `/api/admin/lessons/${lesson!.id}/sources/${sourceId}`,
        },
        { parse: () => undefined },
      );
      setEdits(({ [form]: _, ...rest }) => rest);
      setLesson(
        (current) =>
          current && {
            ...current,
            lessonSources: current.lessonSources.filter(
              (source) => source.id !== sourceId,
            ),
          },
      );
    });
  }

  // What the audio panel already read, or else a fresh read; undefined when it cannot be told.
  async function currentAudioExists(code: LanguageCode) {
    if (hasAudio.current[code] === undefined) {
      try {
        const { audio } = await call(
          {
            method: "GET",
            path: `/api/admin/lessons/${lesson!.id}/audio/${code}`,
          },
          adminLessonAudioResponseSchema,
        );
        learnAudio(code, audio !== null);
      } catch {}
    }
    return hasAudio.current[code];
  }

  // A Language with no Lesson Text and blank fields has no text to send, so its tab may save
  // the chapter alone. A cleared Lesson Text is still checked, as it cannot be saved blank.
  const textFields = (code: LanguageCode): Field[] => {
    const optional =
      chapterEdit !== undefined &&
      !hasLessonText(lesson, code) &&
      isBlank(formProps(code).value);
    return [
      { name: "title", label: "Title", kind: "text", optional },
      { name: "content", label: "Content", kind: "textarea", optional },
    ];
  };

  const uploadUnavailable =
    lesson.status === "ARCHIVED"
      ? "Uploads are unavailable for Archived Lessons."
      : !hasLessonText(lesson, languageCode)
        ? `Save the ${languageCode} Lesson Text before uploading audio.`
        : isDirty(languageCode)
          ? `Save the ${languageCode} Lesson Text changes before uploading audio.`
          : undefined;

  return (
    <section className="lesson">
      {error !== null && <ErrorMessage error={error} onRetry={load} />}
      <h2>{lessonLabel(lesson)}</h2>
      <p>
        <span className="badge" data-status={lesson.status}>
          {statusLabels[lesson.status]}
        </span>
      </p>
      {/* No Save of its own: each Language tab's Save sends it. */}
      <EditForm
        name="Chapter"
        fields={[chapterField]}
        status={formState("chapter", true)}
        errors={chapterErrors}
        {...formProps("chapter")}
      />
      <h3>Lesson Texts</h3>
      <div role="tablist" aria-label="Lesson Text Language">
        {languageCodes.map((code) => (
          <button
            key={code}
            type="button"
            role="tab"
            id={`${tabsId}-${code}`}
            aria-selected={code === languageCode}
            aria-controls={`${tabsId}-${code}-panel`}
            disabled={uploading}
            onClick={() => setLanguageCode(code)}
          >
            {code}: {formState(code, hasLessonText(lesson, code))}
          </button>
        ))}
      </div>
      {/* Every Language keeps its form mounted, so a save error or in-flight save survives tab switches. */}
      {languageCodes.map((code) => (
        <div
          key={code}
          role="tabpanel"
          id={`${tabsId}-${code}-panel`}
          aria-labelledby={`${tabsId}-${code}`}
          lang={code}
          hidden={code !== languageCode}
        >
          <EditForm
            name="Lesson Text"
            fields={textFields(code)}
            validate={() => {
              // The chapter is checked with the tab's fields and shown on its own field.
              const problem =
                chapterEdit && fieldProblem(chapterField, chapterEdit.chapter);
              const problems: FieldErrors = problem ? { chapter: problem } : {};
              setChapterErrors(problems);
              return problems;
            }}
            onSave={(submitted) => saveTab(code, submitted)}
            {...formProps(code)}
          />
          {/* Only a Draft's text can change, so only a Draft warns. */}
          {lesson.status === "DRAFT" && narrationWarnings[code] && (
            <p role="status">
              Lesson Text saved.{" "}
              {narrationWarnings[code].audioKnown
                ? `The current ${code} audio may no longer match it;`
                : `Could not check for ${code} audio; if there is any, it may no longer match;`}{" "}
              upload a new rendition if the narration needs replacing.
            </p>
          )}
        </div>
      ))}
      <CurrentAudio
        key={`${languageCode}:${audioReads}`}
        call={call}
        target={{ lessonId: lesson.id, languageCode }}
        onRead={(audio) =>
          learnAudio(
            languageCode,
            audio === undefined ? undefined : audio !== null,
          )
        }
      />
      {/* Not keyed by Language: a failed attempt stays visible after switching tabs. */}
      <AudioUpload
        call={call}
        putObject={putObject}
        target={{ lessonId: lesson.id, languageCode }}
        unavailable={uploadUnavailable}
        onStatusChange={setUpload}
        onComplete={(uploaded) => {
          // Completion made this rendition current, whatever the panel's next read reports.
          learnAudio(uploaded.languageCode, true);
          // The new rendition was made for the text as it is now.
          setNarrationWarnings((current) => ({
            ...current,
            [uploaded.languageCode]: undefined,
          }));
          setAudioReads((count) => count + 1);
        }}
      />
      <h3>Lesson Sources</h3>
      {lesson.lessonSources.length === 0 && <p>No Lesson Sources.</p>}
      <ul className="lesson-sources">
        {lesson.lessonSources.map((source) => {
          const form = sourceForm(source.id);
          return (
            <li key={source.id} className="card">
              <SourceLabel {...source} />
              <EditForm
                name={`Lesson Source ${source.url}`}
                fields={referenceFields}
                validate={validateReferences}
                status={formState(form, true)}
                onSave={(submitted) =>
                  save(
                    { [form]: submitted },
                    {
                      method: "PUT",
                      path: `/api/admin/lessons/${lesson.id}/sources/${source.id}`,
                      body: toReferenceRequest(submitted),
                    },
                  )
                }
                {...formProps(form)}
              />
              <ConfirmButton
                className="danger"
                aria-label={`Detach ${source.url}`}
                disabled={readOnly || detachingNow || writes > 0}
                message={
                  isDirty(form)
                    ? "Detach this Source and discard its unsaved references?"
                    : null
                }
                confirmLabel="Detach"
                onConfirm={() => detach(source.id)}
              >
                Detach
              </ConfirmButton>
              {detaching.failure?.key === source.id && (
                <ErrorMessage error={detaching.failure.error} />
              )}
            </li>
          );
        })}
      </ul>
      <SourceFinder
        call={call}
        onUnsavedChange={setFinderUnsaved}
        // A correction leaves the Lesson's updatedAt alone, so it bypasses applyLesson.
        // ponytail: a Lesson write answered with the old URL after this can still overwrite it
        // until reload; order by a Source version if that ever matters.
        onSourceUpdate={(corrected) =>
          setLesson(
            (current) =>
              current && {
                ...current,
                lessonSources: current.lessonSources.map((cited) =>
                  cited.id === corrected.id
                    ? { ...cited, ...corrected }
                    : cited,
                ),
              },
          )
        }
        readOnly={readOnly}
        attach={{
          attachedIds: lesson.lessonSources.map((source) => source.id),
          busy: detachingNow,
          onAttach: async (sourceId) => {
            const attached = await writeCall(
              {
                method: "PUT",
                path: `/api/admin/lessons/${lesson.id}/sources/${sourceId}`,
                body: noReferences,
              },
              lessonDetailSchema,
            );
            applyLesson(attached);
          },
        }}
      />
      <Publication
        call={call}
        writeCall={writeCall}
        lesson={lesson}
        dirty={dirty}
        busy={uploading || detachingNow}
        onChange={applyLesson}
        onDelete={onDelete}
      />
    </section>
  );
}
