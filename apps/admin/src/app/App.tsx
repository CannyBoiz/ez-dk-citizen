// The Admin shell: the in-memory token, the 401 re-entry prompt, the unsaved-changes
// guards, and switching between the catalogue and one Lesson.
import { useCallback, useEffect, useId, useState } from "react";

import { TokenForm } from "../features/auth";
import { Catalogue, LessonView, type CatalogueFilters } from "../features/lesson";
import { BffError, request, type Call } from "../shared/lib/bff";
import type { Network } from "../shared/lib/network";

export function App({ network }: { network: Network }) {
  // The token lives only in React state: never in storage, cookies, the URL, or the build.
  const [token, setToken] = useState<string | null>(null);
  const [reentry, setReentry] = useState(false);
  const [openLessonId, setOpenLessonId] = useState<number | null>(null);
  // Held here so the catalogue's filters survive opening a Lesson and coming back.
  const [filters, setFilters] = useState<CatalogueFilters>({ chapter: "", status: "" });
  // Whether the open Lesson has unsaved edits; drives both navigation warnings.
  const [dirty, setDirty] = useState(false);
  const reentryTitle = useId();

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const confirmLeave = () =>
    !dirty || window.confirm("You have unsaved changes. Leave and discard them?");

  function disconnect() {
    if (!confirmLeave()) return;
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
        <LessonView
          call={call}
          lessonId={openLessonId}
          onBack={() => confirmLeave() && setOpenLessonId(null)}
          onDirtyChange={setDirty}
        />
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
