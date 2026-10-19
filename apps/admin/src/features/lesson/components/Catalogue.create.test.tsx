// Creating a Draft through the catalogue's form: nothing reaches the Backend until the admin
// confirms in the page.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { App } from "../../../app/App";
import {
  answer,
  catalogue,
  confirmation,
  connect,
  fakeBackend,
  fieldError,
  hold,
  lessonDetail,
  problem,
  rows,
  settle,
  type,
  validToken,
} from "../../../shared/test/support";

const catalogueLessons = catalogue.map((lesson) =>
  lessonDetail(lesson.id, lesson),
);

function newDraftForm() {
  return screen.getByRole("form", { name: "New Draft" });
}

async function showCatalogue(backend = fakeBackend(catalogueLessons)) {
  render(<App network={backend.network} />);
  await connect(validToken);
  await screen.findByRole("table");
  return backend;
}

test("Create draft opens a form asking only for the chapter, and sends nothing", async () => {
  const { requests } = await showCatalogue();
  const sent = requests.length;
  expect(screen.queryByRole("form", { name: "New Draft" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

  const form = newDraftForm();
  expect(
    within(form)
      .getAllByRole("spinbutton")
      .map((field) => field.closest("label")?.textContent),
  ).toEqual(["Chapter"]);
  expect(document.activeElement).toBe(within(form).getByLabelText("Chapter"));
  type("Chapter", "3", form);
  await settle();
  expect(requests.length).toBe(sent);
});

test("the form shows the typed chapter's highest Published or Archived version and its status, or says it has none", async () => {
  await showCatalogue(
    fakeBackend([
      ...catalogueLessons,
      lessonDetail(5, {
        chapter: 2,
        version: 1,
        versionPatch: 9,
        status: "ARCHIVED",
      }),
    ]),
  );
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
  const form = newDraftForm();
  const standing = () => within(form).getByRole("status").textContent;
  expect(standing()).toBe("");

  type("Chapter", "1", form);
  expect(standing()).toBe("Chapter 1's latest version is 1.0, Published.");

  // Major first: 2.1 is above 1.9. The chapter's Draft has no version and is not counted.
  type("Chapter", "2", form);
  expect(standing()).toBe("Chapter 2's latest version is 2.1, Archived.");

  type("Chapter", "3", form);
  expect(standing()).toBe(
    "Chapter 3 has no Published or Archived version yet.",
  );

  type("Chapter", "0", form);
  expect(standing()).toBe("");
});

test("Create draft asks in the page first; confirming creates the Draft, opens its editor, and lists it in the catalogue", async () => {
  const { requests } = await showCatalogue();
  const posts = () => requests.filter((request) => request.method === "POST");
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
  const form = newDraftForm();

  // A chapter that fails its check never reaches the confirmation.
  fireEvent.click(within(form).getByRole("button", { name: "Create draft" }));
  expect(fieldError("Chapter", form)).toBe(
    "Chapter must be a positive whole number.",
  );
  expect(within(form).queryByRole("alertdialog")).toBeNull();

  type("Chapter", "3", form);
  fireEvent.click(within(form).getByRole("button", { name: "Create draft" }));
  expect(confirmation(form).textContent).toContain(
    "Create a new Draft of chapter 3?",
  );
  await settle();
  expect(posts()).toEqual([]);

  answer("Create draft", form);

  await screen.findByRole("heading", {
    name: "Chapter 3 · Draft, created 11 Oct 2026",
  });
  expect(posts()).toEqual([
    {
      method: "POST",
      path: "/api/admin/lessons",
      token: validToken,
      body: { chapter: 3 },
    },
  ]);

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  await screen.findByRole("table");
  expect(rows()).toContainEqual([
    "3",
    "Draft, created 11 Oct 2026",
    "Draft",
    "None",
  ]);
  expect(screen.queryByRole("form", { name: "New Draft" })).toBeNull();
});

test("a refused create shows the Backend's error in the form with the chapter kept, and can be retried", async () => {
  let outage = true;
  await showCatalogue(
    fakeBackend(catalogueLessons, {
      override: (request) =>
        request.method === "POST" && outage
          ? problem(
              503,
              "database_unavailable",
              "The database is unavailable.",
              "req-503",
            )
          : undefined,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
  const form = newDraftForm();
  type("Chapter", "3", form);
  fireEvent.click(within(form).getByRole("button", { name: "Create draft" }));
  answer("Create draft", form);

  const alert = await within(form).findByRole("alert");
  expect(alert.textContent).toContain("The database is unavailable.");
  expect(alert.textContent).toContain("req-503");
  expect(within(form).getByLabelText("Chapter")).toHaveProperty("value", "3");
  expect(screen.getByRole("table")).toBeTruthy();

  outage = false;
  fireEvent.click(within(form).getByRole("button", { name: "Create draft" }));
  answer("Create draft", form);
  await screen.findByRole("heading", {
    name: "Chapter 3 · Draft, created 11 Oct 2026",
  });
});

test("cancelling the create confirmation sends nothing and keeps the form with its chapter", async () => {
  const { requests } = await showCatalogue();
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
  const form = newDraftForm();
  type("Chapter", "3", form);
  const sent = requests.length;

  fireEvent.click(within(form).getByRole("button", { name: "Create draft" }));
  answer("Cancel", form);

  await settle();
  expect(requests.length).toBe(sent);
  expect(within(form).queryByRole("alertdialog")).toBeNull();
  expect(within(form).getByLabelText("Chapter")).toHaveProperty("value", "3");
  expect(document.activeElement).toBe(
    within(form).getByRole("button", { name: "Create draft" }),
  );
});

test("Cancel closes an empty form at once, and asks before discarding a filled one", async () => {
  const { requests } = await showCatalogue();
  const sent = requests.length;
  const opener = () => screen.getByRole("button", { name: "Create draft" });
  const cancel = () =>
    fireEvent.click(
      within(newDraftForm()).getByRole("button", { name: "Cancel" }),
    );

  fireEvent.click(opener());
  cancel();
  expect(screen.queryByRole("form", { name: "New Draft" })).toBeNull();
  expect(document.activeElement).toBe(opener());

  fireEvent.click(opener());
  type("Chapter", "3", newDraftForm());
  cancel();
  expect(confirmation(newDraftForm()).textContent).toContain(
    "Discard the chapter entered for this new Draft?",
  );
  answer("Cancel", newDraftForm());
  expect(within(newDraftForm()).getByLabelText("Chapter")).toHaveProperty(
    "value",
    "3",
  );

  cancel();
  answer("Discard", newDraftForm());
  expect(screen.queryByRole("form", { name: "New Draft" })).toBeNull();
  expect(document.activeElement).toBe(opener());

  expect(localStorage.length).toBe(0);

  fireEvent.click(opener());
  expect(within(newDraftForm()).getByLabelText("Chapter")).toHaveProperty(
    "value",
    "",
  );
  await settle();
  expect(requests.length).toBe(sent);
});

test("the form cannot be cancelled while its Draft is being created", async () => {
  const backend = fakeBackend(catalogueLessons);
  const release = hold(backend.network, (request) => request.method === "POST");
  await showCatalogue(backend);
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
  const form = newDraftForm();
  type("Chapter", "3", form);
  fireEvent.click(within(form).getByRole("button", { name: "Create draft" }));
  answer("Create draft", form);

  await settle();
  const cancels = within(form).getAllByRole("button", { name: "Cancel" });
  expect(cancels).toHaveLength(2);
  for (const cancel of cancels) expect(cancel).toHaveProperty("disabled", true);

  release();
  await screen.findByRole("heading", {
    name: "Chapter 3 · Draft, created 11 Oct 2026",
  });
});

test("a filled New Draft form is kept locally across a closed tab, and cleared once the Draft is created", async () => {
  const { network } = fakeBackend(catalogueLessons);
  const { unmount } = render(<App network={network} />);
  await connect(validToken);
  await screen.findByRole("table");
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
  type("Chapter", "4", newDraftForm());
  unmount();

  render(<App network={network} />);
  await connect(validToken);
  await screen.findByRole("table");
  const form = newDraftForm();
  expect(within(form).getByLabelText("Chapter")).toHaveProperty("value", "4");
  expect(within(form).getByRole("status").textContent).toBe(
    "Chapter 4 has no Published or Archived version yet.",
  );
  expect(JSON.stringify(localStorage)).not.toContain(validToken);

  fireEvent.click(within(form).getByRole("button", { name: "Create draft" }));
  answer("Create draft", form);
  await screen.findByRole("heading", {
    name: "Chapter 4 · Draft, created 11 Oct 2026",
  });
  expect(localStorage.length).toBe(0);
});
