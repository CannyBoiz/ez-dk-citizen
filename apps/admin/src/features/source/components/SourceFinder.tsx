// The Source finder: every canonical Source filtered by URL text in the browser, the
// New Source form, and, inside a Lesson editor, Attach. Canonical Sources are only
// found, created, and reused.
import {
  type CreateSourceRequest,
  type SourceResponse,
  sourceListResponseSchema,
  sourceResponseSchema,
} from "@ez-dk-citizen/api-contracts/schemas";
import { useEffect, useState } from "react";

import { EditForm, type Values } from "../../../shared/components/EditForm";
import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import { BffError, type Call } from "../../../shared/lib/bff";
import { useAction } from "../../../shared/lib/useAction";
import { SourceLabel } from "./SourceLabel";

export function SourceFinder({
  call,
  onUnsavedChange,
  readOnly = false,
  attach,
}: {
  call: Call;
  // Names this finder's unsaved forms: the New Source form, or nothing.
  onUnsavedChange: (forms: string[]) => void;
  // Disables creating and attaching, as on a Lesson that is not a Draft.
  readOnly?: boolean;
  // Present inside a Lesson editor; the standalone Sources screen only finds and creates.
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
  // The URL of the Source this page last created, confirmed until the next create.
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const attaching = useAction<number>();
  // A read-only finder holds no New Source draft, so nothing can be left unsaved.
  const dirty =
    !readOnly && Object.values(newSource).some((value) => value.trim());

  useEffect(() => {
    onUnsavedChange(dirty ? ["New Source"] : []);
    return () => onUnsavedChange([]);
  }, [dirty, onUnsavedChange]);

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

  // Loads once on mount; after that, only create changes the list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
  useEffect(() => void load(), []);

  async function create({ url, publishedAt }: Values) {
    const trimmedUrl = url!.trim();
    setCreatedUrl(null);
    try {
      const created = await call(
        {
          method: "POST",
          path: "/api/admin/sources",
          body: {
            url: trimmedUrl,
            // A native date input yields YYYY-MM-DD; the Source records midnight UTC of that date.
            publishedAt: publishedAt ? `${publishedAt}T00:00:00.000Z` : null,
          } satisfies CreateSourceRequest,
        },
        sourceResponseSchema,
      );
      setSources((current) => [...(current ?? []), created]);
      // The search stays as the admin typed it; the confirmation says if it hides the new Source.
      setCreatedUrl(created.url);
      setNewSource({});
    } catch (caught) {
      if (
        !(caught instanceof BffError && caught.code === "source_url_conflict")
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
      throw new BffError(`${caught.message} ${hint}`, caught);
    }
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
              )}
            </li>
          );
        })}
      </ul>
      <EditForm
        name="New Source"
        fields={[
          { name: "url", label: "Source URL", kind: "url" },
          {
            name: "publishedAt",
            label: "Publication date",
            kind: "date",
            optional: true,
          },
        ]}
        value={readOnly ? {} : newSource}
        onChange={setNewSource}
        readOnly={readOnly}
        submitLabel="Create Source"
        onSave={create}
      />
      {/* Always rendered, so screen readers announce the confirmation when it fills in. */}
      <p role="status">
        {createdUrl !== null && `Source created: ${createdUrl}.`}
        {createdUrl !== null &&
          !matches(createdUrl) &&
          " It doesn't match the current search, so it isn't listed."}
      </p>
    </section>
  );
}
