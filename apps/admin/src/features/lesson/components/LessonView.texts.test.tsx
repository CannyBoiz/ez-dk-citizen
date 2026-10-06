// Authoring localized Lesson Texts in the da, en, and th tabs (ticket 05).
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { App } from "../../../app/App";
import {
  connect,
  fakeBackend,
  fieldError,
  lessonDetail,
  openLesson,
  problem,
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
  await openLesson(1, 1);

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

test("saving one Language sends only its Lesson Text and keeps unsaved text in other tabs", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { network, requests } = fakeBackend([
    lessonDetail(1, { lessonTexts: [thaiText] }),
  ]);
  render(<App network={network} />);
  await connect(validToken);
  await openLesson(1, 1);

  fireEvent.click(tab("da"));
  type("Title", "Kapitel 1", textForm());
  type("Content", "Dansk indhold\n\nAfsnit to", textForm());
  expect(tab("da").textContent).toBe("da: Unsaved");
  expect(unloadBlocked()).toBe(true);

  fireEvent.click(tab("th"));
  type("Title", "บทที่ 1 แก้ไข", textForm());
  expect(tab("th").textContent).toBe("th: Unsaved");
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(tab("th").textContent).toBe("th: Saved"));
  expect(requests.at(-1)).toEqual({
    method: "PUT",
    path: "/api/admin/lessons/1/texts/th",
    token: validToken,
    body: { title: "บทที่ 1 แก้ไข", content: "เนื้อหาภาษาไทย" },
  });
  expect(tab("da").textContent).toBe("da: Unsaved");

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  expect(confirm).toHaveBeenCalledOnce();

  fireEvent.click(tab("da"));
  expect(within(textForm()).getByLabelText("Content")).toHaveProperty(
    "value",
    "Dansk indhold\n\nAfsnit to",
  );
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(tab("da").textContent).toBe("da: Saved"));
  expect(requests.at(-1)).toMatchObject({
    path: "/api/admin/lessons/1/texts/da",
  });
  await waitFor(() => expect(unloadBlocked()).toBe(false));
});

test("blank Lesson Text is rejected in the form and backend validation errors attach to their field", async () => {
  const { network, requests } = fakeBackend([lessonDetail(1)], {
    override: (request) =>
      request.method === "PUT" &&
      request.body &&
      (request.body as { content: string }).content === "rejected"
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
                { path: ["content"], message: "Content is not acceptable." },
              ],
            },
          }
        : undefined,
  });
  render(<App network={network} />);
  await connect(validToken);
  await openLesson(1, 1);
  const sent = requests.length;

  type("Title", "   ", textForm());
  type("Content", "Indhold", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  expect(fieldError("Title", textForm())).toBe("Title must not be blank.");
  expect(fieldError("Content", textForm())).toBeFalsy();
  expect(requests.length).toBe(sent);

  type("Title", "Titel", textForm());
  type("Content", "rejected", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(fieldError("Content", textForm())).toBe(
      "Content is not acceptable.",
    ),
  );
  expect(within(textForm()).getByRole("alert").textContent).toContain(
    "req-422",
  );
  expect(fieldError("Title", textForm())).toBeFalsy();
  expect(tab("th").textContent).toBe("th: Unsaved");
});

test("a failed Lesson Text save keeps the pasted text and can be retried", async () => {
  let outage = true;
  render(
    <App
      network={
        fakeBackend([lessonDetail(1)], {
          override: (request) =>
            request.method === "PUT" && outage
              ? problem(
                  504,
                  "data_service_timeout",
                  "The Data Service timed out.",
                  "req-504",
                )
              : undefined,
        }).network
      }
    />,
  );
  await connect(validToken);
  await openLesson(1, 1);

  type("Title", "บทที่ 1", textForm());
  type("Content", "ข้อความที่วางไว้", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));

  const alert = await within(textForm()).findByRole("alert");
  expect(alert.textContent).toContain("The Data Service timed out.");
  expect(alert.textContent).toContain("req-504");
  expect(within(textForm()).getByLabelText("Content")).toHaveProperty(
    "value",
    "ข้อความที่วางไว้",
  );
  expect(tab("th").textContent).toBe("th: Unsaved");
  fireEvent.click(tab("en"));
  fireEvent.click(tab("th"));
  expect(within(textForm()).getByRole("alert").textContent).toContain(
    "req-504",
  );

  outage = false;
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(tab("th").textContent).toBe("th: Saved"));
  expect(within(textForm()).getByLabelText("Content")).toHaveProperty(
    "value",
    "ข้อความที่วางไว้",
  );
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
    await openLesson(1, 1);

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
