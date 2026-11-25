// Connecting with the admin token and reporting Backend errors on connect.
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { App } from "../../../app/App";
import {
  connect,
  fakeNetwork,
  noClipboard,
  problem,
  validToken,
} from "../../../shared/test/support";

test("connects with a valid token held only in memory", async () => {
  const { network, requests } = fakeNetwork();
  const url = window.location.href;
  const { unmount } = render(<App network={network} clipboard={noClipboard} />);

  expect(screen.getByLabelText("Admin token")).toHaveProperty(
    "type",
    "password",
  );
  await connect(validToken);

  await screen.findByText(/Connected/);
  expect(requests[0]).toMatchObject({
    method: "GET",
    path: "/api/admin/lessons",
    token: validToken,
  });
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  expect(document.cookie).toBe("");
  expect(window.location.href).toBe(url);
  expect(document.body.innerHTML).not.toContain(validToken);

  unmount();
  render(<App network={network} clipboard={noClipboard} />);
  expect(screen.getByLabelText("Admin token")).toHaveProperty("value", "");
});

test("rejects an invalid token clearly", async () => {
  render(<App network={fakeNetwork().network} clipboard={noClipboard} />);

  await connect("wrong-token");

  expect((await screen.findByRole("alert")).textContent).toContain(
    "The admin token was rejected.",
  );
  expect(screen.queryByText(/Connected/)).toBeNull();
});

test("Backend errors show their message and request ID", async () => {
  render(
    <App
      network={
        fakeNetwork(() =>
          problem(
            503,
            "database_unavailable",
            "The database is unavailable.",
            "req-503",
          ),
        ).network
      }
      clipboard={noClipboard}
    />,
  );

  await connect(validToken);

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("The database is unavailable.");
  expect(alert.textContent).toContain("req-503");
});

test("an unreachable Backend is reported", async () => {
  render(
    <App
      network={{
        backend: () => Promise.reject(new TypeError("Failed to fetch")),
        putObject: () => Promise.reject(new Error("Not used")),
      }}
      clipboard={noClipboard}
    />,
  );

  await connect(validToken);

  expect((await screen.findByRole("alert")).textContent).toContain(
    "Could not reach the Backend.",
  );
});
