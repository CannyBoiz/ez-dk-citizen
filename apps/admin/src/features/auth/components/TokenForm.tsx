// Collects the admin token and verifies it with an authenticated read before accepting it.
import { lessonListResponseSchema } from "@ez-dk-citizen/api-contracts/schemas";
import { type SubmitEvent, useState } from "react";

import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import { BackendError, request } from "../../../shared/lib/backend";
import type { Network } from "../../../shared/lib/network";

export function TokenForm({
  network,
  onConnected,
}: {
  network: Network;
  onConnected: (token: string) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: SubmitEvent) {
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
        caught instanceof BackendError && caught.status === 401
          ? new BackendError("The admin token was rejected.", { ...caught })
          : caught,
      );
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
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
