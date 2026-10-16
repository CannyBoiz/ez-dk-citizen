// Editing a Draft's chapter above the Language tabs, and the editor heading.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { App } from "../../../app/App";
import {
  chapterForm,
  connect,
  fakeBackend,
  lessonDetail,
  openLesson,
  settle,
  textForm,
  type,
  validToken,
} from "../../../shared/test/support";

const draftHeading = "Chapter 1 · Draft, created 11 Oct 2026";

test.each([
  [{ status: "DRAFT" }, "Chapter 3 · Draft, created 11 Oct 2026"],
  [
    { status: "PUBLISHED", version: 2, versionPatch: 1 },
    "Chapter 3, version 2.1",
  ],
  [
    { status: "ARCHIVED", version: 1, versionPatch: 10 },
    "Chapter 3, version 1.10",
  ],
] as const)(
  "the heading names a %o Lesson as “%s”",
  async (lesson, heading) => {
    render(
      <App
        network={
          fakeBackend([lessonDetail(1, { chapter: 3, ...lesson })]).network
        }
      />,
    );
    await connect(validToken);
    await openLesson(heading);

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(heading);
  },
);

test("the chapter sits above the Language tabs with no Save of its own, and is marked Unsaved until a tab saves it", async () => {
  const { network, requests } = fakeBackend([lessonDetail(1)]);
  render(<App network={network} />);
  await connect(validToken);
  await openLesson(draftHeading);
  expect(within(chapterForm()).getByText("Saved")).toBeTruthy();
  expect(within(chapterForm()).queryByLabelText("Version")).toBeNull();
  expect(within(chapterForm()).queryByRole("button")).toBeNull();
  expect(
    chapterForm().compareDocumentPosition(screen.getByRole("tablist")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  type("Chapter", "4", chapterForm());
  expect(within(chapterForm()).getByText("Unsaved")).toBeTruthy();
  fireEvent.submit(chapterForm());
  await settle();
  expect(requests.some((request) => request.method === "PATCH")).toBe(false);

  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await screen.findByRole("heading", {
    name: "Chapter 4 · Draft, created 11 Oct 2026",
  });
  expect(within(chapterForm()).getByText("Saved")).toBeTruthy();
  expect(requests.at(-1)).toMatchObject({
    method: "PATCH",
    path: "/api/admin/lessons/1",
    body: { chapter: 4 },
  });
});

test.each(["PUBLISHED", "ARCHIVED"] as const)(
  "the chapter is read-only for %s Lessons",
  async (status) => {
    render(
      <App network={fakeBackend([lessonDetail(1, { status })]).network} />,
    );
    await connect(validToken);
    await openLesson("Chapter 1, version 1.0");

    expect(within(chapterForm()).getByLabelText("Chapter")).toHaveProperty(
      "readOnly",
      true,
    );
    expect(
      within(chapterForm()).queryByRole("button", { name: "Save" }),
    ).toBeNull();
  },
);
