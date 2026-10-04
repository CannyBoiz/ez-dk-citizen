// Browsing and filtering the catalogue, opening Lessons, and creating Drafts.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { App } from "../../../app/App";
import {
  validToken,
  problem,
  fakeNetwork,
  connect,
  catalogue,
  rows,
  chapterVersions,
  lessonDetail,
  fakeBackend,
  type,
  tab,
  textForm,
} from "../../../shared/test/support";

test("the catalogue lists every Lesson with chapter, version, status, and Languages", async () => {
  render(<App network={fakeNetwork(() => ({ status: 200, body: { items: catalogue } })).network} />);
  await connect(validToken);

  await screen.findByRole("table");
  expect(rows()).toEqual([
    ["1", "1", "Published", "da, th"],
    ["1", "2", "Draft", "th"],
    ["2", "1", "Draft", "None"],
    ["2", "2", "Archived", "en"],
  ]);
});

test("chapter and status filters combine in the browser", async () => {
  const { network, requests } = fakeNetwork(() => ({ status: 200, body: { items: catalogue } }));
  render(<App network={network} />);
  await connect(validToken);
  await screen.findByRole("table");
  const sent = requests.length;

  fireEvent.change(screen.getByLabelText("Chapter"), { target: { value: "1" } });
  expect(chapterVersions()).toEqual(["1.1", "1.2"]);

  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "DRAFT" } });
  expect(chapterVersions()).toEqual(["1.2"]);

  fireEvent.change(screen.getByLabelText("Chapter"), { target: { value: "" } });
  expect(chapterVersions()).toEqual(["1.2", "2.1"]);

  fireEvent.change(screen.getByLabelText("Chapter"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "PUBLISHED" } });
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getByText("No Lessons match these filters.")).toBeTruthy();

  expect(requests.length).toBe(sent);
});

test("a chapter filter whose chapter disappears on Refresh falls back to all chapters", async () => {
  let items = catalogue;
  render(<App network={fakeNetwork(() => ({ status: 200, body: { items } })).network} />);
  await connect(validToken);
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText("Chapter"), { target: { value: "2" } });

  items = catalogue.filter((lesson) => lesson.chapter === 1);
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

  await screen.findByText(/2 Lessons/);
  expect(screen.getByLabelText("Chapter")).toHaveProperty("value", "");
  expect(chapterVersions()).toEqual(["1.1", "1.2"]);
});

test("filters are kept when returning from a Lesson", async () => {
  const detail = { ...catalogue[1]!, lessonTexts: [], lessonSources: [] };
  render(
    <App
      network={
        fakeNetwork((request) =>
          request.path === "/api/admin/lessons/2"
            ? { status: 200, body: detail }
            : { status: 200, body: { items: catalogue } },
        ).network
      }
    />,
  );
  await connect(validToken);
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText("Chapter"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "DRAFT" } });

  fireEvent.click(screen.getByRole("button", { name: "Open chapter 1, version 2" }));
  await screen.findByRole("heading", { name: "Chapter 1, version 2" });
  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));

  await screen.findByRole("table");
  expect(screen.getByLabelText("Chapter")).toHaveProperty("value", "1");
  expect(screen.getByLabelText("Status")).toHaveProperty("value", "DRAFT");
  expect(chapterVersions()).toEqual(["1.2"]);
});

test("an empty catalogue says so", async () => {
  render(<App network={fakeNetwork().network} />);
  await connect(validToken);

  await screen.findByText("No Lessons yet.");
  expect(screen.queryByRole("table")).toBeNull();
});

test("opening a Lesson shows its structure, Lesson Texts, and Lesson Sources, and returning reloads the catalogue", async () => {
  let items = catalogue;
  const detail = {
    ...catalogue[0],
    lessonTexts: [
      { languageCode: "th", title: "บทที่ 1", content: "เนื้อหาภาษาไทย" },
      { languageCode: "da", title: "Kapitel 1", content: "Dansk indhold" },
    ],
    lessonSources: [
      {
        id: 7,
        url: "https://example.dk/laerebog",
        publishedAt: "2024-01-01T00:00:00.000Z",
        pageFrom: 12,
        pageTo: 14,
        sectionReference: "Afsnit 2",
      },
    ],
  };
  const { network, requests } = fakeNetwork((request) =>
    request.path === "/api/admin/lessons/1"
      ? { status: 200, body: detail }
      : { status: 200, body: { items } },
  );
  render(<App network={network} />);
  await connect(validToken);
  await screen.findByRole("table");

  fireEvent.click(screen.getByRole("button", { name: "Open chapter 1, version 1" }));

  await screen.findByRole("heading", { name: "Chapter 1, version 1" });
  expect(requests.at(-1)).toMatchObject({ method: "GET", path: "/api/admin/lessons/1" });
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getByText("Published")).toBeTruthy();
  expect(within(textForm()).getByLabelText("Title")).toHaveProperty("value", "บทที่ 1");
  expect(within(textForm()).getByLabelText("Content")).toHaveProperty("value", "เนื้อหาภาษาไทย");
  fireEvent.click(tab("da"));
  expect(within(textForm()).getByLabelText("Title")).toHaveProperty("value", "Kapitel 1");
  expect(screen.getByRole("link", { name: "https://example.dk/laerebog" })).toBeTruthy();
  expect(screen.getByText(/p\. 12–14/)).toBeTruthy();
  expect(screen.getByText(/Afsnit 2/)).toBeTruthy();

  items = [{ ...catalogue[0]!, status: "ARCHIVED" }];
  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));

  await screen.findByRole("table");
  expect(requests.at(-1)).toMatchObject({ method: "GET", path: "/api/admin/lessons" });
  expect(rows()).toEqual([["1", "1", "Archived", "da, th"]]);
});

test("a Data Service outage shows the error with its request ID and can be retried", async () => {
  let listCalls = 0;
  let outage = true;
  render(
    <App
      network={
        fakeNetwork(() =>
          ++listCalls > 1 && outage
            ? problem(502, "data_service_unavailable", "The Data Service is unavailable.", "req-502")
            : { status: 200, body: { items: catalogue } },
        ).network
      }
    />,
  );
  await connect(validToken);

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("The Data Service is unavailable.");
  expect(alert.textContent).toContain("req-502");

  outage = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  await screen.findByRole("table");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("creating a Draft opens its editor and the Lesson appears in the catalogue", async () => {
  const { network, requests } = fakeBackend([lessonDetail(1)]);
  render(<App network={network} />);
  await connect(validToken);
  await screen.findByRole("table");

  type("New Draft chapter", "3");
  type("New Draft version", "2");
  fireEvent.click(screen.getByRole("button", { name: "Create Draft" }));

  await screen.findByRole("heading", { name: "Chapter 3, version 2" });
  expect(requests.find((request) => request.method === "POST")).toMatchObject({
    path: "/api/admin/lessons",
    body: { chapter: 3, version: 2 },
  });
  expect(screen.getByText("Draft")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  await screen.findByRole("table");
  expect(rows()).toContainEqual(["3", "2", "Draft", "None"]);
});

test("New Draft values are kept locally across a closed tab and cleared once the Draft is created", async () => {
  const { network } = fakeBackend([lessonDetail(1)]);
  const { unmount } = render(<App network={network} />);
  await connect(validToken);
  await screen.findByRole("table");
  type("New Draft chapter", "4");
  type("New Draft version", "1");
  unmount();

  render(<App network={network} />);
  await connect(validToken);
  await screen.findByRole("table");
  expect(screen.getByLabelText("New Draft chapter")).toHaveProperty("value", "4");
  expect(screen.getByLabelText("New Draft version")).toHaveProperty("value", "1");
  expect(JSON.stringify(localStorage)).not.toContain(validToken);

  fireEvent.click(screen.getByRole("button", { name: "Create Draft" }));
  await screen.findByRole("heading", { name: "Chapter 4, version 1" });
  expect(localStorage.length).toBe(0);
});
