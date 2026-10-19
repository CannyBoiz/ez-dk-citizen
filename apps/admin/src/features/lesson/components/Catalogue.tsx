// The Lesson catalogue: every Lesson filtered in the browser, plus Create draft and its form.
// A Draft has no version until it is published, so it is shown with its creation date.
import {
  type CreateLessonRequest,
  type LessonSummary,
  lessonDetailSchema,
  lessonListResponseSchema,
  lessonStatusSchema,
} from "@ez-dk-citizen/api-contracts/schemas";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import type { Values } from "../../../shared/components/EditForm";
import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import type { Call } from "../../../shared/lib/backend";
import type { CatalogueFilters } from "../types";
import { statusLabels } from "../utils/statusLabels";
import { lessonLabel, versionLabel } from "../utils/versions";
import { CreateLessonForm } from "./CreateLessonForm";

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
  // The New Draft form's values while it is open; null while it is closed.
  const [newDraft, setNewDraft] = useState(readNewDraft);
  const opener = useRef<HTMLButtonElement>(null);

  function changeNewDraft(value: Values | null) {
    setNewDraft(value);
    storeNewDraft(value ?? {});
  }

  // Create draft comes back with focus. Synchronously, so it is in the page before it takes focus.
  function closeNewDraft() {
    flushSync(() => changeNewDraft(null));
    opener.current?.focus();
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
      <div className="toolbar">
        <p>
          Connected.{" "}
          {lessons === null ? "Loading Lessons…" : `${lessons.length} Lessons`}
        </p>
        <button type="button" onClick={load}>
          Refresh
        </button>
        {newDraft === null && (
          <button
            type="button"
            ref={opener}
            className="primary"
            onClick={() => changeNewDraft({ chapter: "" })}
          >
            Create draft
          </button>
        )}
      </div>
      {error !== null && <ErrorMessage error={error} onRetry={load} />}
      {newDraft !== null && (
        <CreateLessonForm
          lessons={lessons}
          value={newDraft}
          onChange={changeNewDraft}
          onCreate={async (chapter) => {
            const created = await call(
              {
                method: "POST",
                path: "/api/admin/lessons",
                body: { chapter } satisfies CreateLessonRequest,
              },
              lessonDetailSchema,
            );
            storeNewDraft({});
            onOpen(created.id);
          }}
          onClose={closeNewDraft}
        />
      )}
      {lessons?.length === 0 && <p>No Lessons yet.</p>}
      {!!lessons?.length && (
        <>
          <div className="toolbar">
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
          </div>
          {visibleLessons!.length === 0 ? (
            <p>No Lessons match these filters.</p>
          ) : (
            <div className="table-scroll">
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
                      <td>{versionLabel(lesson)}</td>
                      <td>
                        <span className="badge" data-status={lesson.status}>
                          {statusLabels[lesson.status]}
                        </span>
                      </td>
                      <td>
                        {lesson.availableLanguageCodes.join(", ") || "None"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="primary"
                          aria-label={`Open ${lessonLabel(lesson)}`}
                          onClick={() => onOpen(lesson.id)}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// The unsubmitted New Draft form survives a closed tab in this browser only. It holds
// no secret: the token never touches storage. Storage can be unavailable, so failures are ignored.
const newDraftKey = "ez-dk-citizen.admin.newDraft";

// A form left filled in opens again with its values; otherwise it starts closed.
function readNewDraft(): Values | null {
  try {
    const stored = JSON.parse(localStorage.getItem(newDraftKey) ?? "{}");
    return stored.chapter ? { chapter: String(stored.chapter) } : null;
  } catch {
    return null;
  }
}

function storeNewDraft(value: Values) {
  try {
    if (Object.values(value).some(Boolean))
      localStorage.setItem(newDraftKey, JSON.stringify(value));
    else localStorage.removeItem(newDraftKey);
  } catch {}
}
