// The Source finder: every canonical Source filtered by URL text in the browser, each with
// Edit, the New Source form, and, inside a Lesson editor, Attach. Canonical Sources are
// found, created, corrected, and reused, but never deleted.
import {
  type CreateSourceRequest,
  type SourceResponse,
  sourceListResponseSchema,
  sourceResponseSchema,
  type UpdateSourceRequest,
} from "@ez-dk-citizen/api-contracts";
import { useEffect, useState } from "react";

import { ConfirmButton } from "../../../shared/components/ConfirmButton";
import {
  EditForm,
  type Field,
  type Values,
} from "../../../shared/components/EditForm";
import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import { BackendError, type Call } from "../../../shared/lib/backend";
import { useAction } from "../../../shared/lib/useAction";
import { publicationDate, toPublishedAt } from "../utils/publicationDate";
import { SourceLabel } from "./SourceLabel";

const sourceFields: Field[] = [
  { name: "url", label: "Source URL", kind: "url" },
  {
    name: "publishedAt",
    label: "Publication date",
    kind: "date",
    optional: true,
  },
];

// What an Edit form starts from: the Source as saved.
function savedValues(source: SourceResponse): Values {
  return {
    url: source.url,
    publishedAt:
      source.publishedAt === null ? "" : publicationDate(source.publishedAt),
  };
}

export function SourceFinder({
  call,
  onUnsavedChange,
  onSourceUpdate,
  readOnly = false,
  attach,
}: {
  call: Call;
  // Names this finder's unsaved forms, in page order: changed Edit forms and the New Source form.
  onUnsavedChange: (forms: string[]) => void;
  // Told of each corrected Source, so a Lesson editor can show it among its Lesson Sources.
  onSourceUpdate?: (source: SourceResponse) => void;
  // Disables creating and attaching, as on a Lesson that is not a Draft. Correcting a Source
  // stays possible: it changes no Lesson, and Published Lessons need it most.
  readOnly?: boolean;
  // Present inside a Lesson editor; the standalone Sources screen finds, creates, and corrects.
  // `busy` holds Attach back while another change to the Lesson finishes.
  attach?: {
    attachedIds: number[];
    busy: boolean;
    onAttach: (sourceId: number) => Promise<void>;
  };
}) {
  const [sources, setSources] = useState<SourceResponse[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  const [newSource, setNewSource] = useState<Values>({});
  // Open Edit forms by Source ID, with what the admin has typed. Kept while a search hides them.
  const [editing, setEditing] = useState<Record<number, Values>>({});
  // The Source this page last created or corrected, confirmed until the next save.
  const [notice, setNotice] = useState<{
    verb: "created" | "updated";
    url: string;
  } | null>(null);
  const attaching = useAction<number>();
  const isEdited = (source: SourceResponse) => {
    const saved = savedValues(source);
    const typed = editing[source.id];
    return (
      !!typed &&
      Object.keys(saved).some((field) => typed[field] !== saved[field])
    );
  };
  // A read-only finder holds no New Source draft.
  const unsaved = [
    ...(sources ?? []).map(
      (source) => isEdited(source) && `Source ${source.url}`,
    ),
    !readOnly &&
      Object.values(newSource).some((value) => value.trim()) &&
      "New Source",
  ].filter((form) => form !== false);
  // A new array every render, so the report reruns on the names, not on the array.
  const unsavedNames = unsaved.join("\n");

  // biome-ignore lint/correctness/useExhaustiveDependencies: reruns when the names change
  useEffect(() => {
    onUnsavedChange(unsaved);
    return () => onUnsavedChange([]);
  }, [unsavedNames, onUnsavedChange]);

  async function load() {
    setError(null);
    try {
      const { items } = await call(
        { method: "GET", path: "/api/admin/sources" },
        sourceListResponseSchema,
      );
      setSources(items);
    } catch (caught) {
      setError(caught);
    }
  }

  // Loads once on mount; after that, only create and Edit change the list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
  useEffect(() => void load(), []);

  async function create({ url, publishedAt }: Values) {
    const trimmedUrl = url!.trim();
    setNotice(null);
    try {
      const created = await call(
        {
          method: "POST",
          path: "/api/admin/sources",
          body: {
            url: trimmedUrl,
            publishedAt: toPublishedAt(publishedAt),
          } satisfies CreateSourceRequest,
        },
        sourceResponseSchema,
      );
      setSources((current) => [...(current ?? []), created]);
      // The search stays as the admin typed it; the confirmation says if it hides the new Source.
      setNotice({ verb: "created", url: created.url });
      setNewSource({});
    } catch (caught) {
      if (
        !(
          caught instanceof BackendError &&
          caught.code === "source_url_conflict"
        )
      )
        throw caught;
      // Point at the existing Source: search for its URL and reload in case it is new to this page.
      // The hint uses what this page already holds, so a slow reload never delays the message.
      setSearch(trimmedUrl);
      void load();
      const existing = sources?.find((source) => source.url === trimmedUrl);
      const hint = !attach
        ? "It is shown in the list below; attach it from a Draft Lesson."
        : existing && attach.attachedIds.includes(existing.id)
          ? "It is already attached to this Lesson."
          : "Attach the existing Source shown in the list instead.";
      throw new BackendError(`${caught.message} ${hint}`, caught);
    }
  }

  function closeEdit(id: number) {
    setEditing(({ [id]: _closed, ...others }) => others);
  }

  // Asked in the page first, by the Edit form. A refusal, such as a taken URL, keeps the edit.
  // The date goes only when it changed, so a URL fix keeps a stored time other than midnight.
  async function update(source: SourceResponse, { url, publishedAt }: Values) {
    setNotice(null);
    const id = source.id;
    const updated = await call(
      {
        method: "PATCH",
        path: `/api/admin/sources/${id}`,
        body: {
          url: url!.trim(),
          ...(publishedAt !== savedValues(source).publishedAt && {
            publishedAt: toPublishedAt(publishedAt),
          }),
        } satisfies UpdateSourceRequest,
      },
      sourceResponseSchema,
    );
    setSources(
      (current) =>
        current?.map((source) => (source.id === id ? updated : source)) ?? null,
    );
    closeEdit(id);
    setNotice({ verb: "updated", url: updated.url });
    onSourceUpdate?.(updated);
  }

  const needle = search.trim().toLowerCase();
  const matches = (url: string) => url.toLowerCase().includes(needle);
  const visibleSources = sources?.filter((source) => matches(source.url));

  return (
    <section className="card" aria-label="Source finder">
      <h3>Find or create a Source</h3>
      <label>
        Find Sources by URL
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {error !== null && <ErrorMessage error={error} onRetry={load} />}
      {attaching.failure && <ErrorMessage error={attaching.failure.error} />}
      {sources === null && error === null && <p>Loading Sources…</p>}
      {sources?.length === 0 && <p>No Sources yet.</p>}
      {!!sources?.length && visibleSources!.length === 0 && (
        <p>No Sources match this search.</p>
      )}
      <ul className="rows" aria-label="Sources">
        {visibleSources?.map((source) => {
          const attached = attach?.attachedIds.includes(source.id);
          const typed = editing[source.id];
          return (
            <li key={source.id}>
              <SourceLabel {...source} />
              {attach && (
                <>
                  {" "}
                  <button
                    type="button"
                    aria-label={`Attach ${source.url}`}
                    disabled={
                      readOnly ||
                      attach.busy ||
                      attached ||
                      attaching.pending !== null
                    }
                    onClick={() =>
                      attaching.run(source.id, () => attach.onAttach(source.id))
                    }
                  >
                    {attached ? "Attached" : "Attach"}
                  </button>
                </>
              )}{" "}
              {typed ? (
                <ConfirmButton
                  aria-label={`Cancel editing ${source.url}`}
                  message={
                    isEdited(source)
                      ? "Discard the unsaved changes to this Source?"
                      : null
                  }
                  confirmLabel="Discard"
                  onConfirm={() => closeEdit(source.id)}
                >
                  Cancel edit
                </ConfirmButton>
              ) : (
                <button
                  type="button"
                  aria-label={`Edit ${source.url}`}
                  onClick={() =>
                    setEditing((current) => ({
                      ...current,
                      [source.id]: savedValues(source),
                    }))
                  }
                >
                  Edit
                </button>
              )}
              {typed && (
                <EditForm
                  name={`Source ${source.url}`}
                  fields={sourceFields}
                  value={typed}
                  onChange={(value) =>
                    setEditing((current) => ({
                      ...current,
                      [source.id]: value,
                    }))
                  }
                  confirmMessage="This correction applies to every Lesson that cites this Source, including Published and Archived Lessons."
                  onSave={(values) => update(source, values)}
                />
              )}
            </li>
          );
        })}
      </ul>
      <EditForm
        name="New Source"
        fields={sourceFields}
        value={readOnly ? {} : newSource}
        onChange={setNewSource}
        readOnly={readOnly}
        submitLabel="Create Source"
        onSave={create}
      />
      {/* Always rendered, so screen readers announce the confirmation when it fills in. */}
      <p role="status">
        {notice !== null && `Source ${notice.verb}: ${notice.url}.`}
        {notice !== null &&
          !matches(notice.url) &&
          " It doesn't match the current search, so it isn't listed."}
      </p>
    </section>
  );
}
