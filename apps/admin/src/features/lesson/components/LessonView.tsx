// The Lesson editor: the structure form, per-Language Lesson Text tabs, and per-Source
// Lesson Source references, each saved separately, with their unsaved edits reported up
// for the navigation guards; the selected Language's audio; and publication.
import {
  adminLessonAudioResponseSchema,
  type LessonDetail,
  lessonDetailSchema,
  type PatchLessonRequest,
  type UpsertLessonTextRequest,
} from "@ez-dk-citizen/api-contracts/schemas";
import { useEffect, useId, useRef, useState } from "react";

import { EditForm, type Values } from "../../../shared/components/EditForm";
import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import type { Call } from "../../../shared/lib/bff";
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
import { Publication } from "./Publication";

// Each Lesson Source's reference form is keyed by its Source ID.
type Form = "structure" | LanguageCode | `source:${number}`;
const sourceForm = (sourceId: number): Form => `source:${sourceId}`;

export function LessonView({
  call,
  putObject,
  lessonId,
  onBack,
  onUnsavedChange,
  onUploadChange,
}: {
  call: Call;
  putObject: Network["putObject"];
  lessonId: number;
  onBack: () => void;
  // Names the unsaved forms, in page order, for the navigation guards.
  onUnsavedChange: (forms: string[]) => void;
  onUploadChange: (status: UploadStatus) => void;
}) {
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Unsaved edits per form; a form without an entry shows what the backend holds.
  const [edits, setEdits] = useState<Partial<Record<Form, Values>>>({});
  const [languageCode, setLanguageCode] = useState<LanguageCode>("th");
  // The Source finder's New Source form counts towards unsaved edits too.
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
        structure: {
          chapter: String(lesson.chapter),
          version: String(lesson.version),
        },
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
    isDirty("structure") && "Structure",
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
      <section>
        <button type="button" onClick={onBack}>
          Back to catalogue
        </button>
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

  async function save(
    form: Form,
    submitted: Values,
    request: Omit<BffRequest, "token">,
  ) {
    applyLesson(await writeCall(request, lessonDetailSchema));
    // Edits made while the save was in flight stay unsaved.
    setEdits((current) => {
      const { [form]: edit, ...rest } = current;
      return edit === submitted ? rest : current;
    });
  }

  function detach(sourceId: number) {
    const form = sourceForm(sourceId);
    if (
      isDirty(form) &&
      !window.confirm("Detach this Source and discard its unsaved references?")
    )
      return;
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

  const uploadUnavailable =
    lesson.status === "ARCHIVED"
      ? "Uploads are unavailable for Archived Lessons."
      : !hasLessonText(lesson, languageCode)
        ? `Save the ${languageCode} Lesson Text before uploading audio.`
        : isDirty(languageCode)
          ? `Save the ${languageCode} Lesson Text changes before uploading audio.`
          : undefined;

  return (
    <section>
      <button type="button" disabled={uploading} onClick={onBack}>
        Back to catalogue
      </button>
      {error !== null && <ErrorMessage error={error} onRetry={load} />}
      <h2>
        Chapter {lesson.chapter}, version {lesson.version}
      </h2>
      <p>{statusLabels[lesson.status]}</p>
      <EditForm
        name="Structure"
        fields={[
          { name: "chapter", label: "Chapter", kind: "number" },
          { name: "version", label: "Version", kind: "number" },
        ]}
        status={formState("structure", true)}
        onSave={(submitted) =>
          save("structure", submitted, {
            method: "PATCH",
            path: `/api/admin/lessons/${lesson.id}`,
            body: {
              chapter: Number(submitted.chapter),
              version: Number(submitted.version),
            } satisfies PatchLessonRequest,
          })
        }
        {...formProps("structure")}
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
            fields={[
              { name: "title", label: "Title", kind: "text" },
              { name: "content", label: "Content", kind: "textarea" },
            ]}
            onSave={async (submitted) => {
              await save(code, submitted, {
                method: "PUT",
                path: `/api/admin/lessons/${lesson.id}/texts/${code}`,
                body: submitted as UpsertLessonTextRequest,
              });
              // The audio stays current; the admin decides whether to replace it. The check
              // runs after the save settles, so it never holds the form.
              void currentAudioExists(code).then((exists) =>
                setNarrationWarnings((current) => ({
                  ...current,
                  [code]:
                    exists === false
                      ? undefined
                      : { audioKnown: exists === true },
                })),
              );
            }}
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
      <ul>
        {lesson.lessonSources.map((source) => {
          const form = sourceForm(source.id);
          return (
            <li key={source.id}>
              <SourceLabel {...source} />
              <EditForm
                name={`Lesson Source ${source.url}`}
                fields={referenceFields}
                validate={validateReferences}
                status={formState(form, true)}
                onSave={(submitted) =>
                  save(form, submitted, {
                    method: "PUT",
                    path: `/api/admin/lessons/${lesson.id}/sources/${source.id}`,
                    body: toReferenceRequest(submitted),
                  })
                }
                {...formProps(form)}
              />
              <button
                type="button"
                aria-label={`Detach ${source.url}`}
                disabled={readOnly || detachingNow || writes > 0}
                onClick={() => detach(source.id)}
              >
                Detach
              </button>
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
        call={writeCall}
        lesson={lesson}
        dirty={dirty}
        busy={uploading || detachingNow}
        onChange={(next) => {
          applyLesson(next);
          // Archiving makes every form read-only, so unsaved edits can no longer be saved.
          if (next.status === "ARCHIVED") setEdits({});
        }}
      />
    </section>
  );
}
