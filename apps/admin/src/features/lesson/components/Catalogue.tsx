// The Lesson catalogue: every Lesson filtered in the browser, plus the New Draft Lesson form.
import {
  type CreateLessonRequest,
  type LessonSummary,
  lessonDetailSchema,
  lessonListResponseSchema,
  lessonStatusSchema,
} from "@ez-dk-citizen/api-contracts/schemas";
import { useEffect, useState } from "react";

import { EditForm, type Values } from "../../../shared/components/EditForm";
import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import type { Call } from "../../../shared/lib/bff";
import type { CatalogueFilters } from "../types";
import { statusLabels } from "../utils/statusLabels";

// Mounted afresh whenever the admin returns to it, so it always reloads from the backend.
export function Catalogue({
  call,
  filters: { chapter, status },
  onFiltersChange,
  onOpen,
}: {
  call: Call;
  filters: CatalogueFilters;
  onFiltersChange: (filters: CatalogueFilters) => void;
  onOpen: (lessonId: number) => void;
}) {
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [newDraft, setNewDraft] = useState(readNewDraft);

  function changeNewDraft(value: Values) {
    setNewDraft(value);
    storeNewDraft(value);
  }

  async function load() {
    setError(null);
    try {
      const { items } = await call(
        { method: "GET", path: "/api/admin/lessons" },
        lessonListResponseSchema,
      );
      setLessons(items);
    } catch (caught) {
      setError(caught);
    }
  }

  // Load once on connect; re-entering the token must not reset this screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
  useEffect(() => void load(), []);

  const chapters = [...new Set(lessons?.map((lesson) => lesson.chapter))].sort(
    (a, b) => a - b,
  );
  // A chapter that vanished on reload falls back to all chapters, matching what the select shows.
  const chapterFilter = chapters.includes(Number(chapter)) ? chapter : "";
  const visibleLessons = lessons?.filter(
    (lesson) =>
      (!chapterFilter || lesson.chapter === Number(chapterFilter)) &&
      (!status || lesson.status === status),
  );

  return (
    <section>
      <p>
        Connected.{" "}
        {lessons === null ? "Loading Lessons…" : `${lessons.length} Lessons`}
      </p>
      <button type="button" onClick={load}>
        Refresh
      </button>
      {error !== null && <ErrorMessage error={error} onRetry={load} />}
      <EditForm
        name="New Draft Lesson"
        fields={[
          { name: "chapter", label: "New Draft chapter", kind: "number" },
          { name: "version", label: "New Draft version", kind: "number" },
        ]}
        value={newDraft}
        onChange={changeNewDraft}
        submitLabel="Create Draft"
        onSave={async ({ chapter, version }) => {
          const created = await call(
            {
              method: "POST",
              path: "/api/admin/lessons",
              body: {
                chapter: Number(chapter),
                version: Number(version),
              } satisfies CreateLessonRequest,
            },
            lessonDetailSchema,
          );
          storeNewDraft({});
          onOpen(created.id);
        }}
      />
      {lessons?.length === 0 && <p>No Lessons yet.</p>}
      {!!lessons?.length && (
        <>
          <label>
            Chapter
            <select
              value={chapterFilter}
              onChange={(event) =>
                onFiltersChange({ chapter: event.target.value, status })
              }
            >
              <option value="">All chapters</option>
              {chapters.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(event) =>
                onFiltersChange({ chapter, status: event.target.value })
              }
            >
              <option value="">All statuses</option>
              {lessonStatusSchema.options.map((value) => (
                <option key={value} value={value}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
          </label>
          {visibleLessons!.length === 0 ? (
            <p>No Lessons match these filters.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Chapter</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Languages</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleLessons!.map((lesson) => (
                  <tr key={lesson.id}>
                    <td>{lesson.chapter}</td>
                    <td>{lesson.version}</td>
                    <td>{statusLabels[lesson.status]}</td>
                    <td>
                      {lesson.availableLanguageCodes.join(", ") || "None"}
                    </td>
                    <td>
                      <button
                        type="button"
                        aria-label={`Open chapter ${lesson.chapter}, version ${lesson.version}`}
                        onClick={() => onOpen(lesson.id)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

// The unsubmitted New Draft form survives a closed tab in this browser only. It holds
// no secret: the token never touches storage. Storage can be unavailable, so failures are ignored.
const newDraftKey = "ez-dk-citizen.admin.newDraft";

function readNewDraft(): Values {
  try {
    const stored = JSON.parse(localStorage.getItem(newDraftKey) ?? "{}");
    return {
      chapter: String(stored.chapter ?? ""),
      version: String(stored.version ?? ""),
    };
  } catch {
    return { chapter: "", version: "" };
  }
}

function storeNewDraft(value: Values) {
  try {
    if (Object.values(value).some(Boolean))
      localStorage.setItem(newDraftKey, JSON.stringify(value));
    else localStorage.removeItem(newDraftKey);
  } catch {}
}
