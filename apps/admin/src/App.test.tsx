import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { App } from "./App";
import type { BffRequest, BffResponse, Network } from "./network";

afterEach(cleanup);

const validToken = "correct-token";
const lessons = { items: [] };

function problem(status: number, code: string, detail: string, requestId: string) {
  return {
    status,
    body: {
      type: `https://ez-dk-citizen.invalid/problems/${code}`,
      title: "Problem",
      status,
      detail,
      instance: "/api/admin/lessons",
      code,
      requestId,
    },
  };
}

function fakeNetwork(
  respond: (request: BffRequest) => BffResponse = (request) =>
    request.token === validToken
      ? { status: 200, body: lessons }
      : problem(401, "authentication_required", "Authentication is required.", "req-401"),
) {
  const requests: BffRequest[] = [];
  const network: Network = {
    async bff(request) {
      requests.push(request);
      return respond(request);
    },
  };
  return { network, requests };
}

async function connect(token: string) {
  fireEvent.change(screen.getByLabelText("Admin token"), { target: { value: token } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
}

test("connects with a valid token held only in memory", async () => {
  const { network, requests } = fakeNetwork();
  const url = window.location.href;
  const { unmount } = render(<App network={network} />);

  expect(screen.getByLabelText("Admin token")).toHaveProperty("type", "password");
  await connect(validToken);

  await screen.findByText(/Connected/);
  expect(requests[0]).toMatchObject({ method: "GET", path: "/api/admin/lessons", token: validToken });
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  expect(document.cookie).toBe("");
  expect(window.location.href).toBe(url);
  expect(document.body.innerHTML).not.toContain(validToken);

  unmount();
  render(<App network={network} />);
  expect(screen.getByLabelText("Admin token")).toHaveProperty("value", "");
});

test("rejects an invalid token clearly", async () => {
  render(<App network={fakeNetwork().network} />);

  await connect("wrong-token");

  expect((await screen.findByRole("alert")).textContent).toContain("The admin token was rejected.");
  expect(screen.queryByText(/Connected/)).toBeNull();
});

test("Disconnect clears the token and returns to the token prompt", async () => {
  const { network, requests } = fakeNetwork();
  render(<App network={network} />);
  await connect(validToken);
  await screen.findByText(/Connected/);

  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

  expect(screen.getByLabelText("Admin token")).toHaveProperty("value", "");
  expect(screen.queryByText(/Connected/)).toBeNull();
  const sent = requests.length;
  await connect("");
  expect(requests.length).toBe(sent);
});

test("a later 401 prompts for the token over the current screen and the operation can be retried", async () => {
  let accepted = validToken;
  const { network, requests } = fakeNetwork((request) =>
    request.token === accepted
      ? { status: 200, body: { items: [lessonSummary(1), lessonSummary(2)] } }
      : problem(401, "authentication_required", "Authentication is required.", "req-401"),
  );
  render(<App network={network} />);
  await connect(validToken);
  await screen.findByText(/2 Lessons/);

  accepted = "rotated-token";
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

  const dialog = await screen.findByRole("dialog", { name: "Re-enter admin token" });
  expect(screen.getByText(/2 Lessons/)).toBeTruthy();

  await connect("rotated-token");
  await screen.findByText(/2 Lessons/);
  expect(dialog.isConnected).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText(/2 Lessons/);
  expect(requests.at(-1)).toMatchObject({ path: "/api/admin/lessons", token: "rotated-token" });
  expect(screen.queryByRole("alert")).toBeNull();
});

test("the token re-entry prompt offers Disconnect", async () => {
  let accepted = validToken;
  const { network } = fakeNetwork((request) =>
    request.token === accepted
      ? { status: 200, body: lessons }
      : problem(401, "authentication_required", "Authentication is required.", "req-401"),
  );
  render(<App network={network} />);
  await connect(validToken);
  await screen.findByText(/0 Lessons/);

  accepted = "rotated-token";
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  const dialog = await screen.findByRole("dialog", { name: "Re-enter admin token" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByLabelText("Admin token")).toHaveProperty("value", "");
});

test("BFF errors show their message and request ID", async () => {
  render(
    <App
      network={fakeNetwork(() => problem(503, "data_service_unavailable", "The Data Service is unavailable.", "req-503")).network}
    />,
  );

  await connect(validToken);

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("The Data Service is unavailable.");
  expect(alert.textContent).toContain("req-503");
});

test("an unreachable BFF is reported", async () => {
  render(
    <App
      network={{
        bff: () => Promise.reject(new TypeError("Failed to fetch")),
      }}
    />,
  );

  await connect(validToken);

  expect((await screen.findByRole("alert")).textContent).toContain("Could not reach the BFF.");
});

function lessonSummary(id: number) {
  return {
    id,
    chapter: id,
    version: 1,
    status: "DRAFT",
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    availableLanguageCodes: [],
  };
}
