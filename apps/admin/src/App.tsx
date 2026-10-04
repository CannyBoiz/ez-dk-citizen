import {
  lessonDetailSchema,
  lessonListResponseSchema,
  lessonStatusSchema,
  type LessonDetail,
  type LessonStatus,
  type LessonSummary,
} from "@ez-dk-citizen/api-contracts/schemas";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";

import { BffError, request } from "./bff";
import type { BffRequest, Network } from "./network";

type Call = <T>(
  bffRequest: Omit<BffRequest, "token">,
  schema: { parse(value: unknown): T },
) => Promise<T>;

export function App({ network }: { network: Network }) {
  // The token lives only in React state: never in storage, cookies, the URL, or the build.
  const [token, setToken] = useState<string | null>(null);
  const [reentry, setReentry] = useState(false);
  const [openLessonId, setOpenLessonId] = useState<number | null>(null);
  // Held here so the catalogue's filters survive opening a Lesson and coming back.
  const [filters, setFilters] = useState<CatalogueFilters>({ chapter: "", status: "" });
  const reentryTitle = useId();

  function disconnect() {
    setToken(null);
    setReentry(false);
    setOpenLessonId(null);
    setFilters({ chapter: "", status: "" });
  }

  const call = useCallback<Call>(
    async (bffRequest, schema) => {
      try {
        return await request(network, { ...bffRequest, token: token ?? "" }, schema);
      } catch (error) {
        if (error instanceof BffError && error.status === 401) setReentry(true);
        throw error;
      }
    },
    [network, token],
  );

  return (
    <main>
      <header>
        <h1>ez-dk-citizen Admin</h1>
        {token !== null && (
          <button type="button" onClick={disconnect}>
            Disconnect
          </button>
        )}
      </header>
      {token === null ? (
        <TokenForm network={network} onConnected={setToken} />
      ) : openLessonId === null ? (
        <Catalogue
          call={call}
          filters={filters}
          onFiltersChange={setFilters}
          onOpen={setOpenLessonId}
        />
      ) : (
        <LessonView call={call} lessonId={openLessonId} onBack={() => setOpenLessonId(null)} />
      )}
      {token !== null && reentry && (
        <div className="overlay">
          <div role="dialog" aria-modal="true" aria-labelledby={reentryTitle}>
            <h2 id={reentryTitle}>Re-enter admin token</h2>
            <p>The BFF rejected the admin token. Enter it again, then retry.</p>
            <TokenForm
              network={network}
              onConnected={(newToken) => {
                setToken(newToken);
                setReentry(false);
              }}
            />
            <button type="button" onClick={disconnect}>
              Disconnect
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function TokenForm({
  network,
  onConnected,
}: {
  network: Network;
  onConnected: (token: string) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await request(
        network,
        { method: "GET", path: "/api/admin/lessons", token: value },
        lessonListResponseSchema,
      );
      onConnected(value);
    } catch (caught) {
      setError(
        caught instanceof BffError && caught.status === 401
          ? new BffError("The admin token was rejected.", { ...caught })
          : caught,
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label>
        Admin token
        <input
          type="password"
          autoComplete="off"
          required
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="submit" disabled={busy}>
        Connect
      </button>
      {error !== null && <ErrorMessage error={error} />}
    </form>
  );
}

const statusLabels: Record<LessonStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

// Mounted afresh whenever the admin returns to it, so it always reloads from the backend.
type CatalogueFilters = { chapter: string; status: string };

function Catalogue({
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
  useEffect(() => void load(), []);

  const chapters = [...new Set(lessons?.map((lesson) => lesson.chapter))].sort((a, b) => a - b);
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
        Connected. {lessons === null ? "Loading Lessons…" : `${lessons.length} Lessons`}
      </p>
      <button type="button" onClick={load}>
        Refresh
      </button>
      {error !== null && <ErrorMessage error={error} onRetry={load} />}
      {lessons?.length === 0 && <p>No Lessons yet.</p>}
      {!!lessons?.length && (
        <>
          <label>
            Chapter
            <select
              value={chapterFilter}
              onChange={(event) => onFiltersChange({ chapter: event.target.value, status })}
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
              onChange={(event) => onFiltersChange({ chapter, status: event.target.value })}
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
                    <td>{lesson.availableLanguageCodes.join(", ") || "None"}</td>
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

function LessonView({
  call,
  lessonId,
  onBack,
}: {
  call: Call;
  lessonId: number;
  onBack: () => void;
}) {
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

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

  return (
    <section>
      <button type="button" onClick={onBack}>
        Back to catalogue
      </button>
      {error !== null && <ErrorMessage error={error} onRetry={load} />}
      {lesson === null ? (
        error === null && <p>Loading Lesson…</p>
      ) : (
        <>
          <h2>
            Chapter {lesson.chapter}, version {lesson.version}
          </h2>
          <p>{statusLabels[lesson.status]}</p>
          <h3>Lesson Texts</h3>
          {lesson.lessonTexts.length === 0 && <p>No Lesson Texts.</p>}
          {lesson.lessonTexts.map((text) => (
            <article key={text.languageCode} lang={text.languageCode}>
              <h4>
                {text.languageCode}: {text.title}
              </h4>
              <p style={{ whiteSpace: "pre-wrap" }}>{text.content}</p>
            </article>
          ))}
          <h3>Lesson Sources</h3>
          {lesson.lessonSources.length === 0 && <p>No Lesson Sources.</p>}
          <ul>
            {lesson.lessonSources.map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.url}
                </a>
                {[
                  source.publishedAt && `published ${source.publishedAt.slice(0, 10)}`,
                  pageRange(source.pageFrom, source.pageTo),
                  source.sectionReference,
                ]
                  .filter(Boolean)
                  .map((part) => ` · ${part}`)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function pageRange(from: number | null, to: number | null) {
  const pages = [...new Set([from, to].filter((page) => page !== null))].join("–");
  return pages && `p. ${pages}`;
}

function ErrorMessage({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { message, requestId } =
    error instanceof BffError ? error : new BffError("Something went wrong.");
  return (
    <p role="alert">
      {message}
      {requestId && (
        <>
          {" "}
          Request ID: <code>{requestId}</code>
        </>
      )}
      {onRetry && (
        <>
          {" "}
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </>
      )}
    </p>
  );
}
