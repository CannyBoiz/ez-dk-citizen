// Authoring localized Lesson Texts in the da, en, and th tabs, each saved with the chapter.

import type { PatchLessonRequest } from "@ez-dk-citizen/api-contracts";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, test } from "vitest";

import { App } from "../../../app/App";
import {
  answer,
  chapterForm,
  connect,
  fakeBackend,
  fieldError,
  lessonDetail,
  openLesson,
  problem,
  settle,
  tab,
  textForm,
  thaiText,
  type,
  unloadBlocked,
  validToken,
} from "../../../shared/test/support";

test("the editor shows da, en, and th tabs with Thai selected and each Language's state", async () => {
  render(
    <App
      network={
        fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })]).network
      }
    />,
  );
  await connect(validToken);
  await openLesson();

  expect(
    screen.getAllByRole("tab").map((element) => element.textContent),
  ).toEqual(["da: Missing", "en: Missing", "th: Saved"]);
  expect(tab("th").getAttribute("aria-selected")).toBe("true");
  expect(within(textForm()).getByLabelText("Title")).toHaveProperty(
    "value",
    "บทที่ 1",
  );
  expect(within(textForm()).getByLabelText("Content")).toHaveProperty(
    "value",
    "เนื้อหาภาษาไทย",
  );
  expect(within(textForm()).getByLabelText("Title")).toHaveProperty(
    "type",
    "text",
  );
  expect(within(textForm()).getByLabelText("Content").tagName).toBe("TEXTAREA");

  fireEvent.click(tab("da"));
  expect(tab("da").getAttribute("aria-selected")).toBe("true");
  expect(within(textForm()).getByLabelText("Title")).toHaveProperty(
    "value",
    "",
  );
});

test("a tab's Save sends the chapter changed on another tab with its own Lesson Text, and leaves other tabs unsaved", async () => {
  const { network, requests } = fakeBackend([
    lessonDetail(1, { lessonTexts: [thaiText] }),
  ]);
  render(<App network={network} />);
  await connect(validToken);
  await openLesson();

  type("Chapter", "4", chapterForm());
  type("Title", "บทที่ 1 แก้ไข", textForm());
  expect(tab("th").textContent).toBe("th: Unsaved");
  fireEvent.click(tab("da"));
  type("Title", "Kapitel 4", textForm());
  type("Content", "Dansk indhold\n\nAfsnit to", textForm());
  expect(tab("da").textContent).toBe("da: Unsaved");
  expect(unloadBlocked()).toBe(true);
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));

  await screen.findByRole("heading", {
    name: "Chapter 4 · Draft, created 11 Oct 2026",
  });
  expect(requests.at(-1)).toEqual({
    method: "PATCH",
    path: "/api/admin/lessons/1",
    token: validToken,
    body: {
      chapter: 4,
      text: {
        languageCode: "da",
        title: "Kapitel 4",
        content: "Dansk indhold\n\nAfsnit to",
      },
    },
  });
  expect(within(chapterForm()).getByText("Saved")).toBeTruthy();
  expect(tab("da").textContent).toBe("da: Saved");
  expect(tab("th").textContent).toBe("th: Unsaved");

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  answer("Cancel");

  fireEvent.click(tab("th"));
  expect(within(textForm()).getByLabelText("Title")).toHaveProperty(
    "value",
    "บทที่ 1 แก้ไข",
  );
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(tab("th").textContent).toBe("th: Saved"));
  expect(requests.at(-1)).toMatchObject({
    method: "PATCH",
    body: {
      text: {
        languageCode: "th",
        title: "บทที่ 1 แก้ไข",
        content: thaiText.content,
      },
    },
  });
  expect(requests.at(-1)?.body).not.toHaveProperty("chapter");
  await waitFor(() => expect(unloadBlocked()).toBe(false));
});

test("a tab with no Lesson Text and blank fields saves only the chapter", async () => {
  const { network, requests } = fakeBackend([lessonDetail(1)]);
  render(<App network={network} />);
  await connect(validToken);
  await openLesson();

  type("Chapter", "4", chapterForm());
  expect(within(chapterForm()).getByText("Unsaved")).toBeTruthy();
  fireEvent.click(tab("en"));
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));

  await screen.findByRole("heading", {
    name: "Chapter 4 · Draft, created 11 Oct 2026",
  });
  expect(requests.at(-1)).toMatchObject({
    method: "PATCH",
    path: "/api/admin/lessons/1",
    body: { chapter: 4 },
  });
  expect(requests.at(-1)?.body).not.toHaveProperty("text");
  expect(tab("en").textContent).toBe("en: Missing");
  expect(fieldError("Title", textForm())).toBeFalsy();
});

test("a cleared Lesson Text is refused in the page, so the chapter change is not saved without it", async () => {
  const { network, requests } = fakeBackend([
    lessonDetail(1, { lessonTexts: [thaiText] }),
  ]);
  render(<App network={network} />);
  await connect(validToken);
  await openLesson();
  const sent = requests.length;

  type("Chapter", "4", chapterForm());
  type("Title", "", textForm());
  type("Content", "", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));

  expect(fieldError("Title", textForm())).toBe("Title must not be blank.");
  expect(fieldError("Content", textForm())).toBe("Content must not be blank.");
  await settle();
  expect(requests.length).toBe(sent);
  expect(within(chapterForm()).getByText("Unsaved")).toBeTruthy();
});

test("a Save checks the chapter and the tab's fields in the page, and backend errors attach to their fields", async () => {
  const { network, requests } = fakeBackend([lessonDetail(1)], {
    override: (request) =>
      request.method === "PATCH" &&
      (request.body as PatchLessonRequest).text?.content === "rejected"
        ? {
            status: 422,
            body: {
              ...problem(
                422,
                "validation_failed",
                "Request body failed validation.",
                "req-422",
              ).body,
              errors: [
                { path: ["chapter"], message: "Chapter is not acceptable." },
                {
                  path: ["text", "content"],
                  message: "Content is not acceptable.",
                },
              ],
            },
          }
        : undefined,
  });
  render(<App network={network} />);
  await connect(validToken);
  await openLesson();
  const sent = requests.length;

  type("Chapter", "0", chapterForm());
  type("Title", "   ", textForm());
  type("Content", "Indhold", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  expect(fieldError("Chapter", chapterForm())).toBe(
    "Chapter must be a positive whole number.",
  );
  expect(fieldError("Title", textForm())).toBe("Title must not be blank.");
  expect(fieldError("Content", textForm())).toBeFalsy();
  expect(requests.length).toBe(sent);

  type("Chapter", "5", chapterForm());
  type("Title", "Titel", textForm());
  type("Content", "rejected", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(fieldError("Content", textForm())).toBe(
      "Content is not acceptable.",
    ),
  );
  expect(fieldError("Chapter", chapterForm())).toBe(
    "Chapter is not acceptable.",
  );
  expect(within(textForm()).getByRole("alert").textContent).toContain(
    "req-422",
  );
  expect(fieldError("Title", textForm())).toBeFalsy();
  expect(within(chapterForm()).getByText("Unsaved")).toBeTruthy();
  expect(tab("th").textContent).toBe("th: Unsaved");
});

test("a failed Save keeps the chapter and the pasted text, saves neither, and can be retried", async () => {
  let outage = true;
  const { network, requests } = fakeBackend([lessonDetail(1)], {
    override: (request) =>
      request.method === "PATCH" && outage
        ? problem(
            503,
            "database_unavailable",
            "The database is unavailable.",
            "req-503",
          )
        : undefined,
  });
  render(<App network={network} />);
  await connect(validToken);
  await openLesson();

  type("Chapter", "6", chapterForm());
  type("Title", "บทที่ 1", textForm());
  type("Content", "ข้อความที่วางไว้", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));

  const alert = await within(textForm()).findByRole("alert");
  expect(alert.textContent).toContain("The database is unavailable.");
  expect(alert.textContent).toContain("req-503");
  expect(within(chapterForm()).getByLabelText("Chapter")).toHaveProperty(
    "value",
    "6",
  );
  expect(within(chapterForm()).getByText("Unsaved")).toBeTruthy();
  expect(within(textForm()).getByLabelText("Content")).toHaveProperty(
    "value",
    "ข้อความที่วางไว้",
  );
  expect(tab("th").textContent).toBe("th: Unsaved");
  expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
    "Chapter 1 · Draft, created 11 Oct 2026",
  );
  fireEvent.click(tab("en"));
  fireEvent.click(tab("th"));
  expect(within(textForm()).getByRole("alert").textContent).toContain(
    "req-503",
  );

  outage = false;
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await screen.findByRole("heading", {
    name: "Chapter 6 · Draft, created 11 Oct 2026",
  });
  expect(tab("th").textContent).toBe("th: Saved");
  expect(requests.at(-1)?.body).toEqual({
    chapter: 6,
    text: { languageCode: "th", title: "บทที่ 1", content: "ข้อความที่วางไว้" },
  });
});

test.each(["PUBLISHED", "ARCHIVED"] as const)(
  "Lesson Text fields are read-only for %s Lessons",
  async (status) => {
    render(
      <App
        network={
          fakeBackend([lessonDetail(1, { status, lessonTexts: [thaiText] })])
            .network
        }
      />,
    );
    await connect(validToken);
    await openLesson();

    for (const code of ["th", "da"]) {
      fireEvent.click(tab(code));
      expect(within(textForm()).getByLabelText("Title")).toHaveProperty(
        "readOnly",
        true,
      );
      expect(within(textForm()).getByLabelText("Content")).toHaveProperty(
        "readOnly",
        true,
      );
      expect(
        within(textForm()).queryByRole("button", { name: "Save" }),
      ).toBeNull();
    }
    expect(within(textForm()).getByLabelText("Title")).toHaveProperty(
      "value",
      "",
    );
    expect(tab("th").textContent).toBe("th: Saved");
  },
);
