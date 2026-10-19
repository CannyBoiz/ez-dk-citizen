// The publication checklist, Publish with its version, Archive, and Delete in the Lesson editor
// (Stage 4 ticket 07, Stage 4b tickets 02 and 04).
import type {
  LessonDetail,
  PatchLessonRequest,
} from "@ez-dk-citizen/api-contracts/schemas";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, test } from "vitest";

import { App } from "../../../app/App";
import type {
  BackendRequest,
  BackendResponse,
} from "../../../shared/lib/network";
import {
  answer,
  chapterForm,
  confirmation,
  connect,
  fakeBackend,
  finder,
  firstOnly,
  hold,
  lawSource,
  lessonDetail,
  lessonSummary,
  newSourceForm,
  openLesson,
  problem,
  rows,
  settle,
  tab,
  textForm,
  thaiText,
  type,
  validToken,
} from "../../../shared/test/support";
import { statusLabels } from "../utils/statusLabels";

const citedLaw = {
  ...lawSource,
  pageFrom: null,
  pageTo: null,
  sectionReference: null,
};
const complete = (id: number, overrides: Partial<LessonDetail> = {}) =>
  lessonDetail(id, {
    availableLanguageCodes: ["th"],
    lessonTexts: [thaiText],
    lessonSources: [citedLaw],
    ...overrides,
  });

function publication() {
  return screen.getByRole("region", { name: "Publication" });
}

function checklist() {
  return within(publication())
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

function publishButton() {
  return within(publication()).getByRole("button", { name: "Publish" });
}

async function openFirst(
  backend: ReturnType<typeof fakeBackend>,
  lesson: string | number = 1,
) {
  render(<App network={backend.network} />);
  await connect(validToken);
  await openLesson(lesson);
}

const draftOfChapterOne = "Chapter 1 · Draft, created 11 Oct 2026";

// The radio choices the publish confirmation offers, by label, and whether each is chosen.
function choices() {
  return within(confirmation(publication()))
    .queryAllByRole("radio")
    .map(
      (radio) =>
        `${radio.closest("label")?.textContent}${(radio as HTMLInputElement).checked ? " (chosen)" : ""}`,
    );
}

function confirmButton() {
  return within(confirmation(publication())).getByRole("button", {
    name: "Publish",
  });
}

function patches(backend: ReturnType<typeof fakeBackend>) {
  return backend.requests.filter((request) => request.method === "PATCH");
}

test("the checklist shows the required items from what the backend holds, and the optional ones", async () => {
  await openFirst(fakeBackend([lessonDetail(1)], { sources: [lawSource] }));

  expect(checklist()).toEqual([
    "Thai Lesson Text (required): Missing",
    "Lesson Source (required): Missing",
    "Thai audio (optional)",
    "Danish or English Lesson Text (optional)",
  ]);

  type("Title", "บทที่ 1", textForm());
  type("Content", "เนื้อหา", textForm());
  expect(checklist()[0]).toBe("Thai Lesson Text (required): Missing");
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(checklist()[0]).toBe("Thai Lesson Text (required): Saved"),
  );

  fireEvent.click(
    await within(finder()).findByRole("button", {
      name: `Attach ${lawSource.url}`,
    }),
  );
  await waitFor(() =>
    expect(checklist()[1]).toBe("Lesson Source (required): Saved"),
  );
});

test("Publish is disabled while any form on the Lesson is unsaved", async () => {
  await openFirst(fakeBackend([complete(1)]));
  expect(publishButton()).toHaveProperty("disabled", false);

  type("Chapter", "2", chapterForm());
  expect(publishButton()).toHaveProperty("disabled", true);
  type("Chapter", "1", chapterForm());
  expect(publishButton()).toHaveProperty("disabled", false);

  type("Content", "แก้ไข", textForm());
  expect(publishButton()).toHaveProperty("disabled", true);
  type("Content", thaiText.content, textForm());
  expect(publishButton()).toHaveProperty("disabled", false);

  type(
    "Page from",
    "3",
    screen.getByRole("form", { name: `Lesson Source ${lawSource.url}` }),
  );
  expect(publishButton()).toHaveProperty("disabled", true);
  type(
    "Page from",
    "",
    screen.getByRole("form", { name: `Lesson Source ${lawSource.url}` }),
  );
  expect(publishButton()).toHaveProperty("disabled", false);

  type("Source URL", "https://example.dk/half-typed", newSourceForm());
  expect(publishButton()).toHaveProperty("disabled", true);
});

test("a chapter's first publication confirms in the page as version 1.0 with no choice, and the catalogue reflects it", async () => {
  const backend = fakeBackend([complete(1)]);
  await openFirst(backend);
  const sent = backend.requests.length;

  fireEvent.click(publishButton());

  // The confirmation reads the Lesson list fresh before it says which version this becomes.
  await waitFor(() =>
    expect(confirmation(publication()).textContent).toContain(
      "Publish as version 1.0",
    ),
  );
  expect(backend.requests.slice(sent)).toEqual([
    { method: "GET", path: "/api/admin/lessons", token: validToken },
  ]);
  expect(choices()).toEqual([]);
  expect(confirmButton()).toHaveProperty("disabled", false);

  fireEvent.click(confirmButton());

  await screen.findByRole("heading", { name: "Chapter 1, version 1.0" });
  expect(screen.getByText("Published")).toBeTruthy();
  expect(patches(backend)).toEqual([
    {
      method: "PATCH",
      path: "/api/admin/lessons/1",
      token: validToken,
      body: { status: "PUBLISHED" },
    },
  ]);
  expect(within(publication()).queryByRole("alertdialog")).toBeNull();
  expect(
    within(publication()).queryByRole("button", { name: "Publish" }),
  ).toBeNull();
  expect(within(chapterForm()).getByLabelText("Chapter")).toHaveProperty(
    "readOnly",
    true,
  );

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  await screen.findByRole("table");
  expect(rows()).toEqual([["1", "1.0", "Published", "th"]]);
});

test("a later publication requires choosing a content change or a fix, each showing the version it produces", async () => {
  const backend = fakeBackend([
    complete(1),
    complete(2, { chapter: 1, status: "ARCHIVED" }),
    complete(3, {
      chapter: 1,
      status: "ARCHIVED",
      version: 2,
      versionPatch: 1,
    }),
  ]);
  await openFirst(backend, draftOfChapterOne);

  fireEvent.click(publishButton());
  await waitFor(() =>
    expect(choices()).toEqual(["Content change → 3.0", "Fix → 2.2"]),
  );
  expect(confirmation(publication()).textContent).toContain("2.1");
  expect(confirmButton()).toHaveProperty("disabled", true);

  fireEvent.click(
    within(confirmation(publication())).getByLabelText("Fix → 2.2"),
  );
  expect(choices()).toEqual(["Content change → 3.0", "Fix → 2.2 (chosen)"]);
  expect(confirmButton()).toHaveProperty("disabled", false);

  // Cancelling sends nothing, and the next confirmation starts with nothing chosen.
  answer("Cancel", publication());
  await settle();
  expect(patches(backend)).toEqual([]);
  fireEvent.click(publishButton());
  await waitFor(() =>
    expect(choices()).toEqual(["Content change → 3.0", "Fix → 2.2"]),
  );
  expect(confirmButton()).toHaveProperty("disabled", true);

  fireEvent.click(
    within(confirmation(publication())).getByLabelText("Content change → 3.0"),
  );
  fireEvent.click(confirmButton());

  await screen.findByRole("heading", { name: "Chapter 1, version 3.0" });
  expect(patches(backend)).toEqual([
    {
      method: "PATCH",
      path: "/api/admin/lessons/1",
      token: validToken,
      body: { status: "PUBLISHED", changeKind: "content" },
    },
  ]);
});

test("the choice counts from the chapter's versions as the backend holds them when the confirmation opens", async () => {
  let elsewhere = false;
  const backend = fakeBackend([complete(1)], {
    // Another tab published and archived version 4.0 of chapter 1 after this editor opened.
    override: (request) =>
      elsewhere &&
      request.method === "GET" &&
      request.path === "/api/admin/lessons"
        ? {
            status: 200,
            body: {
              items: [
                lessonSummary(1, { availableLanguageCodes: ["th"] }),
                lessonSummary(2, {
                  chapter: 1,
                  status: "ARCHIVED",
                  version: 4,
                  versionPatch: 0,
                }),
                lessonSummary(3, {
                  chapter: 2,
                  status: "ARCHIVED",
                  version: 9,
                }),
              ],
            },
          }
        : undefined,
  });
  await openFirst(backend);
  elsewhere = true;

  fireEvent.click(publishButton());

  await waitFor(() =>
    expect(choices()).toEqual(["Content change → 5.0", "Fix → 4.1"]),
  );
});

test("backend refusals appear inside the confirmation, which then offers the choice the backend asks for", async () => {
  // The confirmation's first read is stale: it misses the version the backend holds.
  let stale = false;
  const backend = fakeBackend(
    [complete(1), complete(2, { chapter: 1, status: "ARCHIVED" })],
    {
      override: (request) => {
        if (
          !stale ||
          request.method !== "GET" ||
          request.path !== "/api/admin/lessons"
        )
          return undefined;
        stale = false;
        return {
          status: 200,
          body: {
            items: [lessonSummary(1, { availableLanguageCodes: ["th"] })],
          },
        };
      },
    },
  );
  await openFirst(backend, draftOfChapterOne);
  stale = true;

  fireEvent.click(publishButton());
  await waitFor(() =>
    expect(confirmation(publication()).textContent).toContain(
      "Publish as version 1.0",
    ),
  );
  fireEvent.click(confirmButton());

  const alert = await within(confirmation(publication())).findByRole("alert");
  expect(alert.textContent).toContain(
    "A change kind is required to publish this Lesson.",
  );
  expect(alert.textContent).toContain(
    "Choose a content change or a fix: this chapter already has a version.",
  );
  expect(alert.textContent).toContain("req-422-change-kind");
  expect(screen.getByText("Draft")).toBeTruthy();

  // The versions are read again, so the choice appears beside the refusal.
  await waitFor(() =>
    expect(choices()).toEqual(["Content change → 2.0", "Fix → 1.1"]),
  );
  expect(within(confirmation(publication())).getByRole("alert")).toBe(alert);
  fireEvent.click(
    within(confirmation(publication())).getByLabelText("Fix → 1.1"),
  );
  fireEvent.click(confirmButton());
  await screen.findByRole("heading", { name: "Chapter 1, version 1.1" });
});

test("a failed read of the Lesson list is shown inside the confirmation and can be retried", async () => {
  let outage = false;
  const backend = fakeBackend([complete(1)], {
    override: (request) =>
      outage &&
      request.method === "GET" &&
      request.path === "/api/admin/lessons"
        ? problem(
            503,
            "database_unavailable",
            "The database is unavailable.",
            "req-503-list",
          )
        : undefined,
  });
  await openFirst(backend);
  outage = true;

  fireEvent.click(publishButton());
  const alert = await within(confirmation(publication())).findByRole("alert");
  expect(alert.textContent).toContain("req-503-list");
  expect(confirmButton()).toHaveProperty("disabled", true);

  outage = false;
  fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(confirmation(publication()).textContent).toContain(
      "Publish as version 1.0",
    ),
  );
  expect(confirmButton()).toHaveProperty("disabled", false);
  expect(patches(backend)).toEqual([]);
});

// The backend's publication refusals, injected for a PATCH that publishes.
const refusePublication = (response: BackendResponse) => ({
  override: (request: BackendRequest) =>
    request.method === "PATCH" &&
    (request.body as PatchLessonRequest).status === "PUBLISHED"
      ? response
      : undefined,
});

test("an incomplete Draft shows the backend's refusal with each missing requirement", async () => {
  const incomplete = problem(
    409,
    "lesson_publication_incomplete",
    "Lesson is missing publication prerequisites.",
    "req-409-incomplete",
  );
  await openFirst(
    fakeBackend(
      [lessonDetail(1)],
      refusePublication({
        ...incomplete,
        body: {
          ...incomplete.body,
          errors: [
            {
              path: ["lessonTexts", "th"],
              message: "A Thai Lesson Text is required.",
            },
            {
              path: ["lessonSources"],
              message: "At least one Lesson Source is required.",
            },
          ],
        },
      }),
    ),
  );

  fireEvent.click(publishButton());
  await waitFor(() =>
    expect(confirmButton()).toHaveProperty("disabled", false),
  );
  fireEvent.click(confirmButton());

  const alert = await within(confirmation(publication())).findByRole("alert");
  expect(alert.textContent).toContain(
    "Lesson is missing publication prerequisites.",
  );
  expect(alert.textContent).toContain("req-409-incomplete");
  expect(alert.textContent).toContain("A Thai Lesson Text is required.");
  expect(alert.textContent).toContain(
    "At least one Lesson Source is required.",
  );
  expect(screen.getByText("Draft")).toBeTruthy();
  expect(confirmButton()).toHaveProperty("disabled", false);
});

function replaceButton() {
  return within(confirmation(publication())).getByRole("button", {
    name: "Replace",
  });
}

test("when the chapter has a Published version, the confirmation replaces it, naming both versions, and the catalogue reflects both changes", async () => {
  const backend = fakeBackend([
    complete(1, { status: "PUBLISHED", version: 2, versionPatch: 1 }),
    complete(2, { chapter: 1 }),
  ]);
  await openFirst(backend, draftOfChapterOne);
  const message = () =>
    confirmation(publication()).querySelector("p")?.textContent;

  fireEvent.click(publishButton());
  await waitFor(() =>
    expect(choices()).toEqual(["Content change → 3.0", "Fix → 2.2"]),
  );
  expect(message()).toBe(
    "Archive version 2.1 and publish this Draft as a content change or a fix?",
  );
  expect(replaceButton()).toHaveProperty("disabled", true);
  expect(
    within(confirmation(publication())).queryByRole("button", {
      name: "Publish",
    }),
  ).toBeNull();

  fireEvent.click(
    within(confirmation(publication())).getByLabelText("Content change → 3.0"),
  );
  expect(message()).toBe("Archive version 2.1 and publish this Draft as 3.0?");
  fireEvent.click(
    within(confirmation(publication())).getByLabelText("Fix → 2.2"),
  );
  expect(message()).toBe("Archive version 2.1 and publish this Draft as 2.2?");
  expect(replaceButton()).toHaveProperty("disabled", false);

  // Cancelling sends nothing.
  answer("Cancel", publication());
  await settle();
  expect(patches(backend)).toEqual([]);

  fireEvent.click(publishButton());
  await waitFor(() =>
    expect(choices()).toEqual(["Content change → 3.0", "Fix → 2.2"]),
  );
  fireEvent.click(
    within(confirmation(publication())).getByLabelText("Fix → 2.2"),
  );
  fireEvent.click(replaceButton());

  await screen.findByRole("heading", { name: "Chapter 1, version 2.2" });
  expect(patches(backend)).toEqual([
    {
      method: "PATCH",
      path: "/api/admin/lessons/2",
      token: validToken,
      body: { status: "PUBLISHED", changeKind: "fix", replacesLessonId: 1 },
    },
  ]);
  expect(within(publication()).queryByRole("alertdialog")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  await screen.findByRole("table");
  expect(rows()).toEqual([
    ["1", "2.1", "Archived", "th"],
    ["1", "2.2", "Published", "th"],
  ]);
});

test("a replacement that changes nothing is refused inside the confirmation", async () => {
  await openFirst(
    fakeBackend(
      [complete(1, { status: "PUBLISHED" }), complete(2, { chapter: 1 })],
      refusePublication(
        problem(
          409,
          "lesson_unchanged",
          "The Draft's Lesson Texts and Lesson Sources are identical to the Published Lesson's.",
          "req-409-unchanged",
        ),
      ),
    ),
    draftOfChapterOne,
  );

  fireEvent.click(publishButton());
  await waitFor(() =>
    expect(choices()).toEqual(["Content change → 2.0", "Fix → 1.1"]),
  );
  fireEvent.click(
    within(confirmation(publication())).getByLabelText("Fix → 1.1"),
  );
  fireEvent.click(replaceButton());

  const alert = await within(confirmation(publication())).findByRole("alert");
  expect(alert.textContent).toContain(
    "The Draft's Lesson Texts and Lesson Sources are identical to the Published Lesson's.",
  );
  expect(alert.textContent).toContain("req-409-unchanged");
  expect(screen.getByText("Draft")).toBeTruthy();
  answer("Cancel", publication());
  expect(
    within(publication())
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["Publish", "Delete"]);
});

test("a Published version the confirmation did not know of is refused inside it, which then names the current one", async () => {
  // The confirmation's first read is stale: it misses the Published version 1.1 that
  // replaced 1.0 elsewhere.
  let stale = false;
  const backend = fakeBackend(
    [
      complete(1, { status: "ARCHIVED" }),
      complete(2, { chapter: 1 }),
      complete(3, { chapter: 1, status: "PUBLISHED", versionPatch: 1 }),
    ],
    {
      override: (request) => {
        if (
          !stale ||
          request.method !== "GET" ||
          request.path !== "/api/admin/lessons"
        )
          return undefined;
        stale = false;
        return {
          status: 200,
          body: {
            items: [
              lessonSummary(1, {
                status: "PUBLISHED",
                availableLanguageCodes: ["th"],
              }),
              lessonSummary(2, { chapter: 1, availableLanguageCodes: ["th"] }),
            ],
          },
        };
      },
    },
  );
  await openFirst(backend, draftOfChapterOne);
  stale = true;

  fireEvent.click(publishButton());
  await waitFor(() =>
    expect(choices()).toEqual(["Content change → 2.0", "Fix → 1.1"]),
  );
  fireEvent.click(
    within(confirmation(publication())).getByLabelText("Fix → 1.1"),
  );
  fireEvent.click(replaceButton());

  const alert = await within(confirmation(publication())).findByRole("alert");
  expect(alert.textContent).toContain(
    "This publication does not replace the chapter's current Published Lesson.",
  );
  expect(screen.getByText("Draft")).toBeTruthy();
  // The versions are read again, so the confirmation names the Published version it would
  // archive now.
  await waitFor(() =>
    expect(choices()).toEqual(["Content change → 2.0", "Fix → 1.2"]),
  );
  expect(confirmation(publication()).textContent).toContain(
    "Archive version 1.1 and publish this Draft",
  );
  fireEvent.click(
    within(confirmation(publication())).getByLabelText("Fix → 1.2"),
  );
  fireEvent.click(replaceButton());

  await screen.findByRole("heading", { name: "Chapter 1, version 1.2" });
  expect(patches(backend).map((request) => request.body)).toEqual([
    { status: "PUBLISHED", changeKind: "fix", replacesLessonId: 1 },
    { status: "PUBLISHED", changeKind: "fix", replacesLessonId: 3 },
  ]);
});

test.each([
  ["DRAFT", ["Publish", "Delete"]],
  ["PUBLISHED", ["Archive"]],
  ["ARCHIVED", []],
] as const)("a %s Lesson offers %j", async (status, actions) => {
  await openFirst(fakeBackend([complete(1, { status })]));

  expect(
    within(publication())
      .queryAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(actions);
});

test("deleting a Draft asks in the page what will be lost, and then returns to the catalogue without it", async () => {
  const backend = fakeBackend([
    complete(1, { status: "PUBLISHED" }),
    complete(2, { chapter: 1 }),
  ]);
  await openFirst(backend, draftOfChapterOne);
  const sent = backend.requests.length;
  const deleteButton = () =>
    within(publication()).getByRole("button", { name: "Delete" });

  fireEvent.click(deleteButton());
  const message = confirmation(publication()).textContent;
  expect(message).toContain(
    "Lesson Texts, Lesson Source references, and Lesson Audio",
  );
  expect(message).toContain("Canonical Sources stay");
  expect(message).toContain("cannot be undone");
  answer("Cancel", publication());
  expect(within(publication()).queryByRole("alertdialog")).toBeNull();
  await settle();
  expect(backend.requests.length).toBe(sent);

  fireEvent.click(deleteButton());
  answer("Delete", publication());

  await screen.findByRole("table");
  expect(rows()).toEqual([["1", "1.0", "Published", "th"]]);
  expect(backend.requests.slice(sent)).toContainEqual({
    method: "DELETE",
    path: "/api/admin/lessons/2",
    token: validToken,
  });
});

test("archiving a Published Lesson asks in the page first, and cancelling sends nothing", async () => {
  const backend = fakeBackend([complete(1, { status: "PUBLISHED" })]);
  await openFirst(backend);
  const sent = backend.requests.length;
  const archive = () =>
    within(publication()).getByRole("button", { name: "Archive" });

  fireEvent.click(archive());
  const message = confirmation(publication()).textContent;
  expect(message).toContain("terminal");
  expect(message).toContain("read-only");
  expect(message).toContain("learner catalogue");
  answer("Cancel", publication());
  expect(within(publication()).queryByRole("alertdialog")).toBeNull();
  await settle();
  expect(backend.requests.length).toBe(sent);
  expect(screen.getByText(statusLabels.PUBLISHED)).toBeTruthy();

  fireEvent.click(archive());
  answer("Archive", publication());
  await waitFor(() => expect(screen.getByText("Archived")).toBeTruthy());
  expect(backend.requests.at(-1)).toMatchObject({
    method: "PATCH",
    body: { status: "ARCHIVED" },
  });
});

test("a save answered after a newer change never replaces the newer Lesson", async () => {
  const backend = fakeBackend([complete(1)]);
  await openFirst(backend);
  const releaseSave = hold(
    backend.network,
    firstOnly((request) => request.method === "PATCH"),
    "response",
  );

  type("Content", "บันทึกช้า", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(patches(backend)).toHaveLength(1));
  // Saved from another tab, as the th tab's Save is still in flight.
  type("Chapter", "2", chapterForm());
  fireEvent.click(tab("da"));
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await screen.findByRole("heading", {
    name: "Chapter 2 · Draft, created 11 Oct 2026",
  });

  // The late answer still holds chapter 1, from before the chapter was saved.
  releaseSave();
  await settle();
  expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
    "Chapter 2 · Draft, created 11 Oct 2026",
  );
  fireEvent.click(tab("th"));
  expect(within(textForm()).getByLabelText("Content")).toHaveProperty(
    "value",
    "บันทึกช้า",
  );
});

test("an Archived Lesson stays readable with every mutation disabled", async () => {
  await openFirst(
    fakeBackend(
      [
        complete(1, {
          status: "ARCHIVED",
          lessonTexts: [thaiText],
          lessonSources: [citedLaw],
        }),
      ],
      {
        sources: [
          lawSource,
          { id: 9, url: "https://example.dk/other", publishedAt: null },
        ],
      },
    ),
  );

  expect(within(textForm()).getByLabelText("Title")).toHaveProperty(
    "value",
    thaiText.title,
  );
  expect(
    within(
      screen.getByRole("form", { name: `Lesson Source ${lawSource.url}` }),
    ).getByLabelText("Page from"),
  ).toHaveProperty("readOnly", true);
  expect(within(publication()).queryAllByRole("button")).toEqual([]);
  expect(
    within(chapterForm()).queryByRole("button", { name: "Save" }),
  ).toBeNull();
  expect(within(textForm()).queryByRole("button", { name: "Save" })).toBeNull();
  expect(
    screen.getByRole("button", { name: `Detach ${lawSource.url}` }),
  ).toHaveProperty("disabled", true);
  expect(
    await within(finder()).findByRole("button", {
      name: "Attach https://example.dk/other",
    }),
  ).toHaveProperty("disabled", true);
  expect(
    within(newSourceForm()).queryByRole("button", { name: "Create Source" }),
  ).toBeNull();
  expect(screen.getByLabelText("MP3 file")).toHaveProperty("disabled", true);
});
