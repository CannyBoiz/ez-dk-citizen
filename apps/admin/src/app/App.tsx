// The Admin shell: the in-memory token, the 401 re-entry prompt, the unsaved-changes
// guards, and switching between the catalogue, the Sources screen, and one Lesson.
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { UploadStatus } from "../features/audio";
import { TokenForm } from "../features/auth";
import {
  Catalogue,
  type CatalogueFilters,
  LessonView,
} from "../features/lesson";
import { SourceFinder } from "../features/source";
import { ConfirmButton } from "../shared/components/ConfirmButton";
import { BackendError, type Call, request } from "../shared/lib/backend";
import type { Network } from "../shared/lib/network";

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });

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
  // The open screen's unsaved forms by name, and what leaving would lose of an upload; both
  // drive the navigation warnings. Reported separately, because the Sources screen has edits but
  // no upload, and each screen also uses its own value for its own locks.
  const [unsaved, setUnsaved] = useState<string[]>([]);
  const [upload, setUpload] = useState<UploadStatus>("idle");
  const losses = [
    unsaved.length > 0 &&
      `Unsaved changes in ${listFormat.format(unsaved)} will be discarded.`,
    upload === "active" &&
      "An upload is in progress, and its outcome will not be shown.",
    upload === "recoverable" &&
      "A failed upload can still be recovered on this page, and that recovery will be discarded.",
  ].filter((loss) => loss !== false);
  const reentryTitle = useId();

  // Moves focus to the new screen, so keyboard and screen-reader users start at its top.
  const mainRef = useRef<HTMLElement>(null);
  const shown =
    token === null
      ? "token"
      : typeof screen === "string"
        ? screen
        : `lesson:${screen.lessonId}`;
  const firstShown = useRef(shown);
  useEffect(() => {
    if (shown !== firstShown.current) mainRef.current?.focus();
  }, [shown]);

  const warnOnUnload = losses.length > 0;
  useEffect(() => {
    if (!warnOnUnload) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [warnOnUnload]);

  const leaveWarning =
    losses.length === 0 ? null : `${losses.join(" ")} Leave anyway?`;

  function disconnect() {
    setToken(null);
    setReentry(false);
    setScreen("catalogue");
    setFilters({ chapter: "", status: "" });
  }

  const call = useCallback<Call>(
    async (backendRequest, schema) => {
      try {
        return await request(
          network,
          { ...backendRequest, token: token ?? "" },
          schema,
        );
      } catch (error) {
        if (error instanceof BackendError && error.status === 401)
          setReentry(true);
        throw error;
      }
    },
    [network, token],
  );

  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="app-header">
        <h1>ez-dk-citizen Admin</h1>
        {token !== null && (
          <ConfirmButton
            className="danger"
            message={leaveWarning}
            confirmLabel="Disconnect"
            onConfirm={disconnect}
          >
            Disconnect
          </ConfirmButton>
        )}
      </header>
      <main id="content" ref={mainRef} tabIndex={-1}>
        {token === null ? (
          <TokenForm network={network} onConnected={setToken} />
        ) : screen === "catalogue" ? (
          <>
            <div className="toolbar">
              <button type="button" onClick={() => setScreen("sources")}>
                Sources
              </button>
            </div>
            <Catalogue
              call={call}
              filters={filters}
              onFiltersChange={setFilters}
              onOpen={(lessonId) => setScreen({ lessonId })}
            />
          </>
        ) : (
          <>
            {/* An upload in progress keeps its Lesson open. */}
            <div className="toolbar">
              <ConfirmButton
                disabled={upload === "active"}
                message={leaveWarning}
                confirmLabel="Leave"
                onConfirm={() => setScreen("catalogue")}
              >
                Back to catalogue
              </ConfirmButton>
            </div>
            {screen === "sources" ? (
              <SourceFinder call={call} onUnsavedChange={setUnsaved} />
            ) : (
              <LessonView
                call={call}
                putObject={network.putObject}
                lessonId={screen.lessonId}
                onUnsavedChange={setUnsaved}
                onUploadChange={setUpload}
                onDelete={() => setScreen("catalogue")}
              />
            )}
          </>
        )}
        {token !== null && reentry && (
          <div className="overlay">
            <div
              className="card"
              role="dialog"
              aria-modal="true"
              aria-labelledby={reentryTitle}
            >
              <h2 id={reentryTitle}>Re-enter admin token</h2>
              <p>
                The Backend rejected the admin token. Enter it again, then
                retry.
              </p>
              <TokenForm
                network={network}
                onConnected={(newToken) => {
                  setToken(newToken);
                  setReentry(false);
                }}
              />
              <ConfirmButton
                message={leaveWarning}
                confirmLabel="Disconnect"
                onConfirm={disconnect}
              >
                Disconnect
              </ConfirmButton>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
