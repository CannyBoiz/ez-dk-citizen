import { lessonListResponseSchema } from "@ez-dk-citizen/api-contracts/schemas";
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
  const reentryTitle = useId();

  function disconnect() {
    setToken(null);
    setReentry(false);
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
      ) : (
        <Connected call={call} />
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

function Connected({ call }: { call: Call }) {
  const [lessonCount, setLessonCount] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function load() {
    setError(null);
    try {
      const lessons = await call(
        { method: "GET", path: "/api/admin/lessons" },
        lessonListResponseSchema,
      );
      setLessonCount(lessons.items.length);
    } catch (caught) {
      setError(caught);
    }
  }

  // Load once on connect; re-entering the token must not reset this screen.
  useEffect(() => void load(), []);

  return (
    <section>
      <p>
        Connected.{" "}
        {lessonCount === null ? "Loading Lessons…" : `${lessonCount} Lessons`}
      </p>
      <button type="button" onClick={load}>
        Refresh
      </button>
      {error !== null && <ErrorMessage error={error} />}
    </section>
  );
}

function ErrorMessage({ error }: { error: unknown }) {
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
    </p>
  );
}
