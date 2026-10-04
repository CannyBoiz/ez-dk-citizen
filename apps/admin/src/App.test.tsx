import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { LessonSummary } from "@ez-dk-citizen/api-contracts/schemas";
import { afterEach, expect, test } from "vitest";

import { App } from "./App";
import type { BffRequest, BffResponse, Network } from "./network";

afterEach(cleanup);

const validToken = "correct-token";
const lessons = { items: [] };

function problem(status: number, code: string, detail: string, requestId: string) {
  return {
    status,
    body: {
      type: `https://ez-dk-citizen.invalid/problems/${code}`,
      title: "Problem",
      status,
      detail,
      instance: "/api/admin/lessons",
      code,
      requestId,
    },
  };
}

function fakeNetwork(
  respond: (request: BffRequest) => BffResponse = (request) =>
    request.token === validToken
      ? { status: 200, body: lessons }
      : problem(401, "authentication_required", "Authentication is required.", "req-401"),
) {
  const requests: BffRequest[] = [];
  const network: Network = {
    async bff(request) {
      requests.push(request);
      return respond(request);
    },
  };
  return { network, requests };
}

async function connect(token: string) {
  fireEvent.change(screen.getByLabelText("Admin token"), { target: { value: token } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
}

test("connects with a valid token held only in memory", async () => {
  const { network, requests } = fakeNetwork();
  const url = window.location.href;
  const { unmount } = render(<App network={network} />);

  expect(screen.getByLabelText("Admin token")).toHaveProperty("type", "password");
  await connect(validToken);

  await screen.findByText(/Connected/);
  expect(requests[0]).toMatchObject({ method: "GET", path: "/api/admin/lessons", token: validToken });
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  expect(document.cookie).toBe("");
  expect(window.location.href).toBe(url);
  expect(document.body.innerHTML).not.toContain(validToken);

  unmount();
  render(<App network={network} />);
  expect(screen.getByLabelText("Admin token")).toHaveProperty("value", "");
});

test("rejects an invalid token clearly", async () => {
  render(<App network={fakeNetwork().network} />);

  await connect("wrong-token");

  expect((await screen.findByRole("alert")).textContent).toContain("The admin token was rejected.");
  expect(screen.queryByText(/Connected/)).toBeNull();
});

test("Disconnect clears the token and returns to the token prompt", async () => {
  const { network, requests } = fakeNetwork();
  render(<App network={network} />);
  await connect(validToken);
  await screen.findByText(/Connected/);

  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

  expect(screen.getByLabelText("Admin token")).toHaveProperty("value", "");
  expect(screen.queryByText(/Connected/)).toBeNull();
  const sent = requests.length;
  await connect("");
  expect(requests.length).toBe(sent);
});

test("a later 401 prompts for the token over the current screen and the operation can be retried", async () => {
  let accepted = validToken;
  const { network, requests } = fakeNetwork((request) =>
    request.token === accepted
      ? { status: 200, body: { items: [lessonSummary(1), lessonSummary(2)] } }
      : problem(401, "authentication_required", "Authentication is required.", "req-401"),
  );
  render(<App network={network} />);
  await connect(validToken);
  await screen.findByText(/2 Lessons/);

  accepted = "rotated-token";
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

  const dialog = await screen.findByRole("dialog", { name: "Re-enter admin token" });
  expect(screen.getByText(/2 Lessons/)).toBeTruthy();

  await connect("rotated-token");
  await screen.findByText(/2 Lessons/);
  expect(dialog.isConnected).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText(/2 Lessons/);
  expect(requests.at(-1)).toMatchObject({ path: "/api/admin/lessons", token: "rotated-token" });
  expect(screen.queryByRole("alert")).toBeNull();
});

test("the token re-entry prompt offers Disconnect", async () => {
  let accepted = validToken;
  const { network } = fakeNetwork((request) =>
    request.token === accepted
      ? { status: 200, body: lessons }
      : problem(401, "authentication_required", "Authentication is required.", "req-401"),
  );
  render(<App network={network} />);
  await connect(validToken);
  await screen.findByText(/0 Lessons/);

  accepted = "rotated-token";
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  const dialog = await screen.findByRole("dialog", { name: "Re-enter admin token" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByLabelText("Admin token")).toHaveProperty("value", "");
});

test("BFF errors show their message and request ID", async () => {
  render(
    <App
      network={fakeNetwork(() => problem(503, "data_service_unavailable", "The Data Service is unavailable.", "req-503")).network}
    />,
  );

  await connect(validToken);

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("The Data Service is unavailable.");
  expect(alert.textContent).toContain("req-503");
});

test("an unreachable BFF is reported", async () => {
  render(
    <App
      network={{
        bff: () => Promise.reject(new TypeError("Failed to fetch")),
      }}
    />,
  );

  await connect(validToken);

  expect((await screen.findByRole("alert")).textContent).toContain("Could not reach the BFF.");
});

function lessonSummary(id: number, overrides: Partial<LessonSummary> = {}): LessonSummary {
  return {
    id,
    chapter: id,
    version: 1,
    status: "DRAFT",
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    availableLanguageCodes: [],
    ...overrides,
  };
}

const catalogue = [
  lessonSummary(1, { status: "PUBLISHED", availableLanguageCodes: ["da", "th"] }),
  lessonSummary(2, { chapter: 1, version: 2, availableLanguageCodes: ["th"] }),
  lessonSummary(3, { chapter: 2, version: 1 }),
  lessonSummary(4, { chapter: 2, version: 2, status: "ARCHIVED", availableLanguageCodes: ["en"] }),
];

function rows() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").slice(0, 4).map((cell) => cell.textContent));
}

function chapterVersions() {
  return rows().map(([chapter, version]) => `${chapter}.${version}`);
}

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
  expect(screen.getByRole("heading", { name: "th: บทที่ 1" })).toBeTruthy();
  expect(screen.getByText("เนื้อหาภาษาไทย")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "da: Kapitel 1" })).toBeTruthy();
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
