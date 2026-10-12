// Editing a Draft's chapter in the structure form (ticket 04), and the editor heading.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { App } from "../../../app/App";
import {
  connect,
  fakeBackend,
  lessonDetail,
  openLesson,
  problem,
  structureForm,
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

test("the structure form asks only for the chapter; editing it marks it unsaved and saving marks it saved", async () => {
  const { network, requests } = fakeBackend([lessonDetail(1)]);
  render(<App network={network} />);
  await connect(validToken);
  await openLesson(draftHeading);
  expect(within(structureForm()).getByText("Saved")).toBeTruthy();
  expect(within(structureForm()).queryByLabelText("Version")).toBeNull();

  type("Chapter", "4", structureForm());
  expect(within(structureForm()).getByText("Unsaved")).toBeTruthy();
  fireEvent.click(
    within(structureForm()).getByRole("button", { name: "Save" }),
  );

  await screen.findByRole("heading", {
    name: "Chapter 4 · Draft, created 11 Oct 2026",
  });
  expect(within(structureForm()).getByText("Saved")).toBeTruthy();
  expect(requests.at(-1)).toMatchObject({
    method: "PATCH",
    path: "/api/admin/lessons/1",
    body: { chapter: 4 },
  });
});

test("a failed structure save keeps the edits and shows the error with its request ID", async () => {
  let outage = true;
  render(
    <App
      network={
        fakeBackend([lessonDetail(1)], {
          override: (request) =>
            request.method === "PATCH" && outage
              ? problem(
                  503,
                  "data_service_unavailable",
                  "The Data Service is unavailable.",
                  "req-503",
                )
              : undefined,
        }).network
      }
    />,
  );
  await connect(validToken);
  await openLesson();

  type("Chapter", "", structureForm());
  fireEvent.click(
    within(structureForm()).getByRole("button", { name: "Save" }),
  );
  expect(
    within(structureForm()).getByText(
      "Chapter must be a positive whole number.",
    ),
  ).toBeTruthy();

  type("Chapter", "7", structureForm());
  fireEvent.click(
    within(structureForm()).getByRole("button", { name: "Save" }),
  );
  const alert = await within(structureForm()).findByRole("alert");
  expect(alert.textContent).toContain("The Data Service is unavailable.");
  expect(alert.textContent).toContain("req-503");
  expect(within(structureForm()).getByLabelText("Chapter")).toHaveProperty(
    "value",
    "7",
  );

  outage = false;
  fireEvent.click(
    within(structureForm()).getByRole("button", { name: "Save" }),
  );
  await screen.findByRole("heading", {
    name: "Chapter 7 · Draft, created 11 Oct 2026",
  });
});

test.each(["PUBLISHED", "ARCHIVED"] as const)(
  "structure is read-only for %s Lessons",
  async (status) => {
    render(
      <App network={fakeBackend([lessonDetail(1, { status })]).network} />,
    );
    await connect(validToken);
    await openLesson("Chapter 1, version 1.0");

    expect(within(structureForm()).getByLabelText("Chapter")).toHaveProperty(
      "readOnly",
      true,
    );
    expect(
      within(structureForm()).queryByRole("button", { name: "Save" }),
    ).toBeNull();
  },
);
