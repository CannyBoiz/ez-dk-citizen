// The Admin shell: the in-memory token, the 401 re-entry prompt, the unsaved-changes
// guards, and switching between the catalogue, the Sources screen, and one Lesson.
import { useCallback, useEffect, useId, useState } from "react";

import type { UploadStatus } from "../features/audio";
import { TokenForm } from "../features/auth";
import {
  Catalogue,
  type CatalogueFilters,
  LessonView,
} from "../features/lesson";
import { SourceFinder } from "../features/source";
import { BffError, type Call, request } from "../shared/lib/bff";
import type { Network } from "../shared/lib/network";

export function App({ network }: { network: Network }) {
  // The token lives only in React state: never in storage, cookies, the URL, or the build.
  const [token, setToken] = useState<string | null>(null);
  const [reentry, setReentry] = useState(false);
  const [screen, setScreen] = useState<
    "catalogue" | "sources" | { lessonId: number }
  >("catalogue");
  // Held here so the catalogue's filters survive opening a Lesson and coming back.
  const [filters, setFilters] = useState<CatalogueFilters>({
    chapter: "",
    status: "",
  });
  // Whether the open screen has unsaved edits, and what leaving would lose of an upload; both
  // drive the navigation warnings. Reported separately, because the Sources screen has edits but
  // no upload, and each screen also uses its own value for its own locks.
  const [dirty, setDirty] = useState(false);
  const [upload, setUpload] = useState<UploadStatus>("idle");
  const losses = [
    dirty && "You have unsaved changes, which will be discarded.",
    upload === "active" &&
      "An upload is in progress, and its outcome will not be shown.",
    upload === "recoverable" &&
      "A failed upload can still be recovered on this page, and that recovery will be discarded.",
  ].filter((loss) => loss !== false);
  const reentryTitle = useId();

  const warnOnUnload = losses.length > 0;
  useEffect(() => {
    if (!warnOnUnload) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [warnOnUnload]);

  const confirmLeave = () =>
    losses.length === 0 || window.confirm(`${losses.join(" ")} Leave anyway?`);

  function disconnect() {
    if (!confirmLeave()) return;
    setToken(null);
    setReentry(false);
    setScreen("catalogue");
    setFilters({ chapter: "", status: "" });
  }

  const call = useCallback<Call>(
    async (bffRequest, schema) => {
      try {
        return await request(
          network,
          { ...bffRequest, token: token ?? "" },
          schema,
        );
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
      ) : screen === "catalogue" ? (
        <>
          <button type="button" onClick={() => setScreen("sources")}>
            Sources
          </button>
          <Catalogue
            call={call}
            filters={filters}
            onFiltersChange={setFilters}
            onOpen={(lessonId) => setScreen({ lessonId })}
          />
        </>
      ) : screen === "sources" ? (
        <section>
          <button
            type="button"
            onClick={() => confirmLeave() && setScreen("catalogue")}
          >
            Back to catalogue
          </button>
          <SourceFinder call={call} onDirtyChange={setDirty} />
        </section>
      ) : (
        <LessonView
          call={call}
          putObject={network.putObject}
          lessonId={screen.lessonId}
          onBack={() => confirmLeave() && setScreen("catalogue")}
          onDirtyChange={setDirty}
          onUploadChange={setUpload}
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
