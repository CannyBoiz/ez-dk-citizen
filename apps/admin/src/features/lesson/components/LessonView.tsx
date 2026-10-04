// The Lesson editor: the structure form, per-Language Lesson Text tabs, and per-Source
// Lesson Source references, each saved separately, with their unsaved edits reported up
// for the navigation guards.
import {
  lessonDetailSchema,
  type LessonDetail,
  type PatchLessonRequest,
  type UpsertLessonTextRequest,
} from "@ez-dk-citizen/api-contracts/schemas";
import { useEffect, useId, useState } from "react";

import { EditForm, type Values } from "../../../shared/components/EditForm";
import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import type { Call } from "../../../shared/lib/bff";
import type { BffRequest } from "../../../shared/lib/network";
import { useAction } from "../../../shared/lib/useAction";
import { SourceFinder, SourceLabel } from "../../source";
import {
  noReferences,
  referenceFields,
  toReferenceRequest,
  toReferenceValues,
  validateReferences,
} from "../utils/references";
import { statusLabels } from "../utils/statusLabels";

// Tab order follows the spec; Thai, the learner's Language, is selected first.
const languageCodes = ["da", "en", "th"] as const;
type LanguageCode = (typeof languageCodes)[number];
// Each Lesson Source's reference form is keyed by its Source ID.
type Form = "structure" | LanguageCode | `source:${number}`;
const sourceForm = (sourceId: number): Form => `source:${sourceId}`;

export function LessonView({
  call,
  lessonId,
  onBack,
  onDirtyChange,
}: {
  call: Call;
  lessonId: number;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Unsaved edits per form; a form without an entry shows what the backend holds.
  const [edits, setEdits] = useState<Partial<Record<Form, Values>>>({});
  const [languageCode, setLanguageCode] = useState<LanguageCode>("th");
  // The Source finder's New Source form counts towards unsaved edits too.
  const [finderDirty, setFinderDirty] = useState(false);
  const detaching = useAction<number>();
  const tabsId = useId();

  async function load() {
    setError(null);
    try {
      setLesson(
        await call({ method: "GET", path: `/api/admin/lessons/${lessonId}` }, lessonDetailSchema),
      );
    } catch (caught) {
      setError(caught);
    }
  }

  useEffect(() => void load(), []);

  const saved: Partial<Record<Form, Values>> = lesson
    ? {
        structure: { chapter: String(lesson.chapter), version: String(lesson.version) },
        ...Object.fromEntries(
          languageCodes.map((code) => {
            const text = lesson.lessonTexts.find((candidate) => candidate.languageCode === code);
            return [code, { title: text?.title ?? "", content: text?.content ?? "" }];
          }),
        ),
        ...Object.fromEntries(
          lesson.lessonSources.map((source) => [sourceForm(source.id), toReferenceValues(source)]),
        ),
      }
    : {};
  const isDirty = (form: Form) =>
    Object.entries(edits[form] ?? {}).some(([field, value]) => value !== saved[form]?.[field]);
  const dirty = finderDirty || (Object.keys(edits) as Form[]).some(isDirty);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty]);

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
  const formProps = (form: Form) => ({
    value: edits[form] ?? saved[form] ?? {},
    onChange: (value: Values) => setEdits((current) => ({ ...current, [form]: value })),
    readOnly,
  });
  const formState = (form: Form, exists: boolean) =>
    isDirty(form) ? "Unsaved" : exists ? "Saved" : "Missing";

  async function save(form: Form, submitted: Values, request: Omit<BffRequest, "token">) {
    setLesson(await call(request, lessonDetailSchema));
    // Edits made while the save was in flight stay unsaved.
    setEdits((current) => {
      const { [form]: edit, ...rest } = current;
      return edit === submitted ? rest : current;
    });
  }

  function detach(sourceId: number) {
    const form = sourceForm(sourceId);
    if (isDirty(form) && !window.confirm("Detach this Source and discard its unsaved references?"))
      return;
    void detaching.run(sourceId, async () => {
      await call(
        { method: "DELETE", path: `/api/admin/lessons/${lesson!.id}/sources/${sourceId}` },
        { parse: () => undefined },
      );
      setEdits(({ [form]: _, ...rest }) => rest);
      setLesson(
        (current) =>
          current && {
            ...current,
            lessonSources: current.lessonSources.filter((source) => source.id !== sourceId),
          },
      );
    });
  }

  return (
    <section>
      <button type="button" onClick={onBack}>
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
            onClick={() => setLanguageCode(code)}
          >
            {code}:{" "}
            {formState(
              code,
              lesson.lessonTexts.some((text) => text.languageCode === code),
            )}
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
            onSave={(submitted) =>
              save(code, submitted, {
                method: "PUT",
                path: `/api/admin/lessons/${lesson.id}/texts/${code}`,
                body: submitted as UpsertLessonTextRequest,
              })
            }
            {...formProps(code)}
          />
        </div>
      ))}
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
                disabled={readOnly || detaching.pending !== null}
                onClick={() => detach(source.id)}
              >
                Detach
              </button>
              {detaching.failure?.key === source.id && <ErrorMessage error={detaching.failure.error} />}
            </li>
          );
        })}
      </ul>
      <SourceFinder
        call={call}
        onDirtyChange={setFinderDirty}
        readOnly={readOnly}
        attach={{
          attachedIds: lesson.lessonSources.map((source) => source.id),
          onAttach: async (sourceId) => {
            setLesson(
              await call(
                {
                  method: "PUT",
                  path: `/api/admin/lessons/${lesson.id}/sources/${sourceId}`,
                  body: noReferences,
                },
                lessonDetailSchema,
              ),
            );
          },
        }}
      />
    </section>
  );
}
