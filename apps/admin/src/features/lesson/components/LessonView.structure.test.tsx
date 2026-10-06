// Editing a Lesson's chapter and version in the structure form (ticket 04).
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

test("editing chapter or version marks the structure unsaved and saving marks it saved", async () => {
  const { network, requests } = fakeBackend([lessonDetail(1)]);
  render(<App network={network} />);
  await connect(validToken);
  await openLesson(1, 1);
  expect(within(structureForm()).getByText("Saved")).toBeTruthy();

  type("Version", "4", structureForm());
  expect(within(structureForm()).getByText("Unsaved")).toBeTruthy();
  fireEvent.click(
    within(structureForm()).getByRole("button", { name: "Save" }),
  );

  await screen.findByRole("heading", { name: "Chapter 1, version 4" });
  expect(within(structureForm()).getByText("Saved")).toBeTruthy();
  expect(requests.at(-1)).toMatchObject({
    method: "PATCH",
    path: "/api/admin/lessons/1",
    body: { chapter: 1, version: 4 },
  });
});

test("a chapter/version conflict shows a clear message and keeps the edits", async () => {
  render(
    <App
      network={
        fakeBackend([
          lessonDetail(1),
          lessonDetail(2, { chapter: 1, version: 2 }),
        ]).network
      }
    />,
  );
  await connect(validToken);
  await screen.findByRole("table");

  type("New Draft chapter", "1");
  type("New Draft version", "2");
  fireEvent.click(screen.getByRole("button", { name: "Create Draft" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "A Lesson with this chapter and version already exists.",
  );
  expect(screen.getByLabelText("New Draft version")).toHaveProperty(
    "value",
    "2",
  );

  await openLesson(1, 1);
  type("Version", "2", structureForm());
  fireEvent.click(
    within(structureForm()).getByRole("button", { name: "Save" }),
  );

  expect(
    (await within(structureForm()).findByRole("alert")).textContent,
  ).toContain("A Lesson with this chapter and version already exists.");
  expect(within(structureForm()).getByLabelText("Version")).toHaveProperty(
    "value",
    "2",
  );
  expect(within(structureForm()).getByText("Unsaved")).toBeTruthy();
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
  await openLesson(1, 1);

  type("Chapter", "7", structureForm());
  type("Version", "", structureForm());
  fireEvent.click(
    within(structureForm()).getByRole("button", { name: "Save" }),
  );
  expect(
    within(structureForm()).getByText(
      "Version must be a positive whole number.",
    ),
  ).toBeTruthy();

  type("Version", "3", structureForm());
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
  await screen.findByRole("heading", { name: "Chapter 7, version 3" });
});

test.each(["PUBLISHED", "ARCHIVED"] as const)(
  "structure is read-only for %s Lessons",
  async (status) => {
    render(
      <App network={fakeBackend([lessonDetail(1, { status })]).network} />,
    );
    await connect(validToken);
    await openLesson(1, 1);

    expect(within(structureForm()).getByLabelText("Chapter")).toHaveProperty(
      "readOnly",
      true,
    );
    expect(within(structureForm()).getByLabelText("Version")).toHaveProperty(
      "readOnly",
      true,
    );
    expect(
      within(structureForm()).queryByRole("button", { name: "Save" }),
    ).toBeNull();
  },
);
