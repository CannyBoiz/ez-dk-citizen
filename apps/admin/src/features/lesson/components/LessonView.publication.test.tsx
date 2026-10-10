// The publication checklist, Publish, and Archive in the Lesson editor (ticket 07).
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
import { expect, test, vi } from "vitest";

import { App } from "../../../app/App";
import type { BffRequest, BffResponse } from "../../../shared/lib/network";
import {
  connect,
  fakeBackend,
  finder,
  hold,
  lawSource,
  lessonDetail,
  newSourceForm,
  openLesson,
  problem,
  rows,
  settle,
  storedAudio,
  structureForm,
  textForm,
  thaiText,
  type,
  unloadBlocked,
  validToken,
} from "../../../shared/test/support";

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
  chapter = 1,
  version = 1,
) {
  render(<App network={backend.network} />);
  await connect(validToken);
  await openLesson(chapter, version);
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

  type("Version", "2", structureForm());
  expect(publishButton()).toHaveProperty("disabled", true);
  expect(
    within(publication()).getByRole("button", { name: "Archive" }),
  ).toHaveProperty("disabled", false);
  type("Version", "1", structureForm());
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

test("publishing a complete Draft makes it Published and read-only, and the catalogue reflects it", async () => {
  const backend = fakeBackend([complete(1)]);
  await openFirst(backend);

  fireEvent.click(publishButton());

  await waitFor(() => expect(screen.getByText("Published")).toBeTruthy());
  expect(backend.requests.at(-1)).toEqual({
    method: "PATCH",
    path: "/api/admin/lessons/1",
    token: validToken,
    body: { status: "PUBLISHED" },
  });
  expect(
    within(publication()).queryByRole("button", { name: "Publish" }),
  ).toBeNull();
  expect(within(structureForm()).getByLabelText("Version")).toHaveProperty(
    "readOnly",
    true,
  );

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  await screen.findByRole("table");
  expect(rows()).toEqual([["1", "1", "Published", "th"]]);
});

// The backend's publication refusals, injected for a PATCH that publishes.
const refusePublication = (response: BffResponse) => ({
  override: (request: BffRequest) =>
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

  const alert = await within(publication()).findByRole("alert");
  expect(alert.textContent).toContain(
    "Lesson is missing publication prerequisites.",
  );
  expect(alert.textContent).toContain("req-409-incomplete");
  expect(alert.textContent).toContain("A Thai Lesson Text is required.");
  expect(alert.textContent).toContain(
    "At least one Lesson Source is required.",
  );
  expect(screen.getByText("Draft")).toBeTruthy();
  expect(publishButton()).toHaveProperty("disabled", false);
});

test("another Published version of the chapter is reported, and no action replaces it in one step", async () => {
  await openFirst(
    fakeBackend(
      [
        complete(1, { status: "PUBLISHED" }),
        complete(2, { chapter: 1, version: 2 }),
      ],
      refusePublication(
        problem(
          409,
          "published_lesson_conflict",
          "This chapter already has a Published Lesson.",
          "req-409-published",
        ),
      ),
    ),
    1,
    2,
  );

  fireEvent.click(publishButton());

  const alert = await within(publication()).findByRole("alert");
  expect(alert.textContent).toContain(
    "This chapter already has a Published Lesson.",
  );
  expect(alert.textContent).toContain("req-409-published");
  expect(screen.getByText("Draft")).toBeTruthy();
  expect(
    within(publication())
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["Publish", "Archive"]);
});

test.each(["DRAFT", "PUBLISHED"] as const)(
  "archiving a %s Lesson asks first, and cancelling sends nothing",
  async (status) => {
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const backend = fakeBackend([complete(1, { status })]);
    await openFirst(backend);
    const sent = backend.requests.length;

    fireEvent.click(
      within(publication()).getByRole("button", { name: "Archive" }),
    );
    expect(confirm).toHaveBeenCalledOnce();
    const message = confirm.mock.calls[0]![0]!;
    expect(message).toContain("terminal");
    expect(message).toContain("read-only");
    expect(message).toContain("learner catalogue");
    expect(backend.requests.length).toBe(sent);

    fireEvent.click(
      within(publication()).getByRole("button", { name: "Archive" }),
    );
    await waitFor(() => expect(screen.getByText("Archived")).toBeTruthy());
    expect(backend.requests.at(-1)).toMatchObject({
      method: "PATCH",
      body: { status: "ARCHIVED" },
    });
  },
);

test("archiving with unsaved edits warns that they will be discarded, then discards them", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  await openFirst(fakeBackend([complete(1)]));

  type("Content", "ยังไม่บันทึก", textForm());
  type("Source URL", "https://example.dk/half-typed", newSourceForm());
  expect(unloadBlocked()).toBe(true);
  fireEvent.click(
    within(publication()).getByRole("button", { name: "Archive" }),
  );
  expect(confirm.mock.calls[0]![0]).toContain(
    "Unsaved changes on this Lesson will be discarded.",
  );

  await waitFor(() => expect(screen.getByText("Archived")).toBeTruthy());
  expect(within(textForm()).getByLabelText("Content")).toHaveProperty(
    "value",
    thaiText.content,
  );
  expect(within(newSourceForm()).getByLabelText("Source URL")).toHaveProperty(
    "value",
    "",
  );
  await waitFor(() => expect(unloadBlocked()).toBe(false));
});

test("a save that finishes after archiving cannot reopen the Archived Lesson", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const backend = fakeBackend([complete(1)], {
    audio: { "1:th": storedAudio() },
  });
  await openFirst(backend);
  const releaseSave = hold(
    backend.network,
    (request) => request.method === "PUT",
    "response",
  );

  type("Content", "บันทึกก่อนเก็บถาวร", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(backend.requests.some((request) => request.method === "PUT")).toBe(
      true,
    ),
  );
  fireEvent.click(
    within(publication()).getByRole("button", { name: "Archive" }),
  );
  await waitFor(() => expect(screen.getByText("Archived")).toBeTruthy());

  releaseSave();
  await waitFor(() =>
    expect(within(textForm()).getByLabelText("Content")).toHaveProperty(
      "value",
      "บันทึกก่อนเก็บถาวร",
    ),
  );
  // Let the late save and its narration check settle.
  await settle();
  expect(screen.getByText("Archived")).toBeTruthy();
  // Text can no longer change, so there is no narration to warn about.
  expect(within(screen.getByRole("tabpanel")).queryByRole("status")).toBeNull();
  expect(within(textForm()).getByLabelText("Content")).toHaveProperty(
    "readOnly",
    true,
  );
  expect(within(publication()).queryAllByRole("button")).toEqual([]);
  expect(
    within(structureForm()).queryByRole("button", { name: "Save" }),
  ).toBeNull();
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
    within(structureForm()).queryByRole("button", { name: "Save" }),
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
