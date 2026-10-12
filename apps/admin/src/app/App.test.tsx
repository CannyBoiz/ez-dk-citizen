// The app shell: Disconnect, 401 re-entry, and the unsaved-changes guards.
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, test } from "vitest";
import {
  answer,
  cited,
  confirmation,
  connect,
  fakeBackend,
  fakeNetwork,
  guideSource,
  lessonDetail,
  lessonSummary,
  lessons,
  newSourceForm,
  openLesson,
  problem,
  settle,
  structureForm,
  tab,
  textForm,
  type,
  unloadBlocked,
  validToken,
} from "../shared/test/support";
import { App } from "./App";

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
      : problem(
          401,
          "authentication_required",
          "Authentication is required.",
          "req-401",
        ),
  );
  render(<App network={network} />);
  await connect(validToken);
  await screen.findByText(/2 Lessons/);

  accepted = "rotated-token";
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

  const dialog = await screen.findByRole("dialog", {
    name: "Re-enter admin token",
  });
  expect(screen.getByText(/2 Lessons/)).toBeTruthy();

  await connect("rotated-token");
  await screen.findByText(/2 Lessons/);
  expect(dialog.isConnected).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText(/2 Lessons/);
  expect(requests.at(-1)).toMatchObject({
    path: "/api/admin/lessons",
    token: "rotated-token",
  });
  expect(screen.queryByRole("alert")).toBeNull();
});

test("the token re-entry prompt offers Disconnect", async () => {
  let accepted = validToken;
  const { network } = fakeNetwork((request) =>
    request.token === accepted
      ? { status: 200, body: lessons }
      : problem(
          401,
          "authentication_required",
          "Authentication is required.",
          "req-401",
        ),
  );
  render(<App network={network} />);
  await connect(validToken);
  await screen.findByText(/0 Lessons/);

  accepted = "rotated-token";
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Re-enter admin token",
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByLabelText("Admin token")).toHaveProperty("value", "");
});

test("dirty edits trigger the before-unload warning and an in-page confirmation before returning to the catalogue", async () => {
  const { network, requests } = fakeBackend([lessonDetail(1)]);
  render(<App network={network} />);
  await connect(validToken);
  await openLesson();
  expect(unloadBlocked()).toBe(false);

  type("Chapter", "5", structureForm());
  expect(unloadBlocked()).toBe(true);

  const sent = requests.length;
  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  answer("Cancel");
  await settle();
  expect(requests.length).toBe(sent);
  expect(within(structureForm()).getByLabelText("Chapter")).toHaveProperty(
    "value",
    "5",
  );

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  answer("Leave");
  await screen.findByRole("table");
  expect(unloadBlocked()).toBe(false);
});

test("the in-page confirmation is operated by keyboard: it opens on Cancel, and Escape puts the button back", async () => {
  render(<App network={fakeBackend([lessonDetail(1)]).network} />);
  await connect(validToken);
  await openLesson();
  type("Chapter", "5", structureForm());

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  expect(document.activeElement).toBe(
    within(confirmation()).getByRole("button", { name: "Cancel" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Back to catalogue" }),
  );
  expect(within(structureForm()).getByLabelText("Chapter")).toHaveProperty(
    "value",
    "5",
  );
});

test("Disconnect with unsaved edits asks in the page, and confirming disconnects", async () => {
  const { network, requests } = fakeBackend([lessonDetail(1)]);
  render(<App network={network} />);
  await connect(validToken);
  await openLesson();
  type("Chapter", "5", structureForm());

  const sent = requests.length;
  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  screen.getByRole("alertdialog", {
    name: "Unsaved changes in Structure will be discarded. Leave anyway?",
  });
  answer("Cancel");
  await settle();
  expect(requests.length).toBe(sent);
  expect(within(structureForm()).getByLabelText("Chapter")).toHaveProperty(
    "value",
    "5",
  );

  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  answer("Disconnect");
  expect(screen.getByLabelText("Admin token")).toHaveProperty("value", "");
  await waitFor(() => expect(unloadBlocked()).toBe(false));
});

test("the leave confirmation names each unsaved form, and a saved form drops out", async () => {
  render(
    <App
      network={
        fakeBackend([lessonDetail(1, { lessonSources: [cited(guideSource)] })])
          .network
      }
    />,
  );
  await connect(validToken);
  await openLesson();

  type("Chapter", "5", structureForm());
  type("Title", "บทที่ 1", textForm());
  fireEvent.click(tab("da"));
  type("Title", "Kapitel 1", textForm());
  type(
    "Page from",
    "3",
    screen.getByRole("form", { name: `Lesson Source ${guideSource.url}` }),
  );
  type("Source URL", "https://example.dk/half-typed", newSourceForm());

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  screen.getByRole("alertdialog", {
    name: `Unsaved changes in Structure, Lesson Text (da), Lesson Text (th), Lesson Source ${guideSource.url}, and New Source will be discarded. Leave anyway?`,
  });

  fireEvent.click(
    within(structureForm()).getByRole("button", { name: "Save" }),
  );
  await waitFor(() =>
    expect(within(structureForm()).getByText("Saved")).toBeTruthy(),
  );
  // The Lesson editor reports its unsaved forms to the shell after it renders.
  await settle();
  screen.getByRole("alertdialog", {
    name: `Unsaved changes in Lesson Text (da), Lesson Text (th), Lesson Source ${guideSource.url}, and New Source will be discarded. Leave anyway?`,
  });
});

test("returning to the catalogue without edits asks nothing", async () => {
  render(<App network={fakeBackend([lessonDetail(1)]).network} />);
  await connect(validToken);
  await openLesson();

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  await screen.findByRole("table");
});

test("a 401 during save prompts for the token, keeps the edits, and the save can be retried", async () => {
  let accepted = validToken;
  const { network, requests } = fakeBackend([lessonDetail(1)], {
    override: (request) =>
      request.token === accepted
        ? undefined
        : problem(
            401,
            "authentication_required",
            "Authentication is required.",
            "req-401",
          ),
  });
  render(<App network={network} />);
  await connect(validToken);
  await openLesson();

  accepted = "rotated-token";
  type("Chapter", "9", structureForm());
  fireEvent.click(
    within(structureForm()).getByRole("button", { name: "Save" }),
  );

  const dialog = await screen.findByRole("dialog", {
    name: "Re-enter admin token",
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));
  answer("Cancel", dialog);
  expect(dialog.isConnected).toBe(true);
  fireEvent.change(within(dialog).getByLabelText("Admin token"), {
    target: { value: "rotated-token" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Connect" }));
  await waitFor(() => expect(dialog.isConnected).toBe(false));
  expect(within(structureForm()).getByLabelText("Chapter")).toHaveProperty(
    "value",
    "9",
  );

  fireEvent.click(
    within(structureForm()).getByRole("button", { name: "Save" }),
  );
  await screen.findByRole("heading", {
    name: "Chapter 9 · Draft, created 11 Oct 2026",
  });
  expect(requests.at(-1)).toMatchObject({
    method: "PATCH",
    token: "rotated-token",
  });
});
