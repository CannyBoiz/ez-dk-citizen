// Authoring localized Lesson Texts in the da, en, and th tabs, each saved with the chapter.

import type { PatchLessonRequest } from "@ez-dk-citizen/api-contracts";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { App } from "../../../app/App";
import type { TextClipboard } from "../../../shared/lib/clipboard";
import {
  answer,
  chapterForm,
  connect,
  fakeBackend,
  fieldError,
  lessonDetail,
  noClipboard,
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

function preview() {
  return within(textForm()).getByRole("region", { name: "Preview" });
}

test("the editor shows da, en, and th tabs with Thai selected and each Language's state", async () => {
  render(
    <App
      network={
        fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })]).network
      }
      clipboard={noClipboard}
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
  render(<App network={network} clipboard={noClipboard} />);
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
  render(<App network={network} clipboard={noClipboard} />);
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
  render(<App network={network} clipboard={noClipboard} />);
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
  render(<App network={network} clipboard={noClipboard} />);
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
  render(<App network={network} clipboard={noClipboard} />);
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
        clipboard={noClipboard}
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

test("the preview under Content renders the unsaved Title and content as headings and paragraphs", async () => {
  render(
    <App
      network={
        fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })]).network
      }
      clipboard={noClipboard}
    />,
  );
  await connect(validToken);
  await openLesson();
  expect(within(preview()).getByRole("paragraph").textContent).toBe(
    "เนื้อหาภาษาไทย",
  );

  type("Title", "บทที่ 1 แก้ไข", textForm());
  type(
    "Content",
    "# ส่วนแรก\nบรรทัดหนึ่ง\nบรรทัดสอง\n\n#### ส่วนย่อย\n\nย่อหน้า **สุดท้าย**",
    textForm(),
  );

  // The Title outranks a section, which outranks a subsection.
  expect(within(preview()).getByRole("heading", { level: 4 }).textContent).toBe(
    "บทที่ 1 แก้ไข",
  );
  expect(within(preview()).getByRole("heading", { level: 5 }).textContent).toBe(
    "ส่วนแรก",
  );
  expect(within(preview()).getByRole("heading", { level: 6 }).textContent).toBe(
    "ส่วนย่อย",
  );
  const paragraphs = within(preview()).getAllByRole("paragraph");
  expect(paragraphs.map((paragraph) => paragraph.textContent)).toEqual([
    "บรรทัดหนึ่งบรรทัดสอง",
    "ย่อหน้า สุดท้าย",
  ]);
  expect(paragraphs[0].querySelectorAll("br")).toHaveLength(1);
  expect(tab("th").textContent).toBe("th: Unsaved");
});

test("the preview renders lists, emphasis and a divider from the unsaved content", async () => {
  render(
    <App
      network={
        fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })]).network
      }
      clipboard={noClipboard}
    />,
  );
  await connect(validToken);
  await openLesson();

  type(
    "Content",
    "- [ ] หนังสือเดินทาง\n  1. **ตัวจริง**\n  2. *สำเนา* ~~เก่า~~\n\n---\n\n3. ขั้นที่สาม",
    textForm(),
  );

  const [bullets, nested, numbered] = within(preview()).getAllByRole("list");
  expect(within(bullets).getAllByRole("listitem")[0].textContent).toBe(
    "หนังสือเดินทางตัวจริงสำเนา เก่า",
  );
  expect(
    within(nested)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["ตัวจริง", "สำเนา เก่า"]);
  expect(within(numbered).getByRole("listitem").textContent).toBe("ขั้นที่สาม");
  expect(numbered).toHaveProperty("start", 3);
  expect(within(preview()).getByRole("strong").textContent).toBe("ตัวจริง");
  expect(within(preview()).getByRole("emphasis").textContent).toBe("สำเนา");
  expect(within(preview()).getByRole("deletion").textContent).toBe("เก่า");
  expect(within(preview()).getByRole("separator")).toBeTruthy();
});

test("the preview labels a note in the form's Language", async () => {
  render(
    <App
      network={
        fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })]).network
      }
      clipboard={noClipboard}
    />,
  );
  await connect(validToken);
  await openLesson();

  type("Content", "> [!TIP]\n> อ่านออกเสียงทุกวัน", textForm());

  const note = within(preview()).getByRole("note", { name: "เคล็ดลับ" });
  expect(within(note).getByRole("paragraph").textContent).toBe(
    "อ่านออกเสียงทุกวัน",
  );
});

test("an Archived Lesson's Lesson Text still shows its preview", async () => {
  render(
    <App
      network={
        fakeBackend([
          lessonDetail(1, {
            status: "ARCHIVED",
            lessonTexts: [{ ...thaiText, content: "## ส่วนแรก\n\nเนื้อหา" }],
          }),
        ]).network
      }
      clipboard={noClipboard}
    />,
  );
  await connect(validToken);
  await openLesson();

  expect(within(textForm()).getByLabelText("Content")).toHaveProperty(
    "readOnly",
    true,
  );
  expect(within(preview()).getByRole("heading", { level: 5 }).textContent).toBe(
    "ส่วนแรก",
  );
  expect(within(preview()).getByRole("paragraph").textContent).toBe("เนื้อหา");
});

function copyButton() {
  return within(preview()).getByRole("button", { name: "Copy as plain text" });
}

test("Copy as plain text copies the narration script of the unsaved content and confirms in the page", async () => {
  const writeText = vi.fn<TextClipboard["writeText"]>(async () => {});
  render(
    <App
      network={
        fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })]).network
      }
      clipboard={{ writeText }}
    />,
  );
  await connect(validToken);
  await openLesson();

  type(
    "Content",
    "## ส่วนแรก\nบรรทัด **หนึ่ง**\n\n> [!TIP]\n> ย่อหน้าสอง",
    textForm(),
  );
  fireEvent.click(copyButton());

  expect((await within(preview()).findByRole("status")).textContent).toBe(
    "Copied the narration script.",
  );
  expect(writeText.mock.calls).toEqual([
    ["ส่วนแรก\n\nบรรทัด หนึ่ง\n\nเคล็ดลับ: ย่อหน้าสอง"],
  ]);
  expect(tab("th").textContent).toBe("th: Unsaved");

  // The clipboard no longer holds what the content says, so the confirmation goes.
  type("Content", "ย่อหน้าใหม่", textForm());
  expect(within(preview()).queryByRole("status")).toBeNull();
});

test("a failed clipboard write shows an error in the page", async () => {
  render(
    <App
      network={
        fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })]).network
      }
      clipboard={{
        async writeText() {
          throw new DOMException("Write permission denied.", "NotAllowedError");
        },
      }}
    />,
  );
  await connect(validToken);
  await openLesson();

  fireEvent.click(copyButton());

  expect((await within(preview()).findByRole("alert")).textContent).toBe(
    "Could not copy the narration script; the clipboard still holds what was there before.",
  );
  expect(within(preview()).queryByRole("status")).toBeNull();

  // The clipboard is still stale, so the error stays until the next copy.
  type("Content", "ย่อหน้าใหม่", textForm());
  expect(within(preview()).getByRole("alert")).toBeTruthy();
});
