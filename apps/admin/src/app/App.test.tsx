// The app shell: Disconnect, 401 re-entry, and the unsaved-changes guards.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { App } from "./App";
import {
  validToken,
  lessons,
  problem,
  fakeNetwork,
  connect,
  lessonSummary,
  lessonDetail,
  fakeBackend,
  openLesson,
  type,
  structureForm,
  unloadBlocked,
} from "../shared/test/support";

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

test("dirty edits trigger the before-unload warning and a confirmation before returning to the catalogue", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<App network={fakeBackend([lessonDetail(1)]).network} />);
  await connect(validToken);
  await openLesson(1, 1);
  expect(unloadBlocked()).toBe(false);

  type("Version", "5", structureForm());
  expect(unloadBlocked()).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(within(structureForm()).getByLabelText("Version")).toHaveProperty("value", "5");

  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  await screen.findByRole("table");
  expect(unloadBlocked()).toBe(false);
});

test("returning to the catalogue without edits asks nothing", async () => {
  const confirm = vi.spyOn(window, "confirm");
  render(<App network={fakeBackend([lessonDetail(1)]).network} />);
  await connect(validToken);
  await openLesson(1, 1);

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  await screen.findByRole("table");
  expect(confirm).not.toHaveBeenCalled();
});

test("a 401 during save prompts for the token, keeps the edits, and the save can be retried", async () => {
  let accepted = validToken;
  const { network, requests } = fakeBackend([lessonDetail(1)], {
    override: (request) =>
      request.token === accepted
        ? undefined
        : problem(401, "authentication_required", "Authentication is required.", "req-401"),
  });
  render(<App network={network} />);
  await connect(validToken);
  await openLesson(1, 1);

  accepted = "rotated-token";
  type("Version", "9", structureForm());
  fireEvent.click(within(structureForm()).getByRole("button", { name: "Save" }));

  const dialog = await screen.findByRole("dialog", { name: "Re-enter admin token" });
  fireEvent.change(within(dialog).getByLabelText("Admin token"), { target: { value: "rotated-token" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Connect" }));
  await waitFor(() => expect(dialog.isConnected).toBe(false));
  expect(within(structureForm()).getByLabelText("Version")).toHaveProperty("value", "9");

  fireEvent.click(within(structureForm()).getByRole("button", { name: "Save" }));
  await screen.findByRole("heading", { name: "Chapter 1, version 9" });
  expect(requests.at(-1)).toMatchObject({ method: "PATCH", token: "rotated-token" });
});
