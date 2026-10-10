// Finding and creating canonical Sources on the Sources screen (ticket 06).
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
  bookSource,
  canonicalEditControls,
  connect,
  fakeBackend,
  fieldError,
  finder,
  guideSource,
  lawSource,
  newSourceForm,
  sourceRows,
  type,
  unloadBlocked,
  validToken,
} from "../../../shared/test/support";

async function openSources(backend: ReturnType<typeof fakeBackend>) {
  render(<App network={backend.network} />);
  await connect(validToken);
  fireEvent.click(await screen.findByRole("button", { name: "Sources" }));
  await within(finder()).findByRole("list", { name: "Sources" });
}

test("Sources are filtered by URL text and show their UTC publication date", async () => {
  await openSources(
    fakeBackend([], { sources: [lawSource, guideSource, bookSource] }),
  );
  await waitFor(() => expect(sourceRows()).toHaveLength(3));

  expect(sourceRows()).toEqual([
    `${lawSource.url} · published 2024-01-15`,
    `${guideSource.url} · publication date unknown`,
    `${bookSource.url} · published 2024-12-31`,
  ]);
  expect(
    screen.getByRole("link", { name: lawSource.url }).getAttribute("href"),
  ).toBe(lawSource.url);

  type("Find Sources by URL", "  NYIDANMARK ", finder());
  expect(sourceRows()).toEqual([
    `${guideSource.url} · publication date unknown`,
  ]);

  type("Find Sources by URL", "nothing-like-this", finder());
  expect(sourceRows()).toEqual([]);
  expect(
    within(finder()).getByText("No Sources match this search."),
  ).toBeTruthy();
  expect(canonicalEditControls()).toEqual([]);
});

test("creating a Source sends a blank date as null and a chosen date as midnight UTC", async () => {
  const backend = fakeBackend();
  await openSources(backend);

  type("Source URL", "https://example.dk/undated", newSourceForm());
  fireEvent.click(
    within(newSourceForm()).getByRole("button", { name: "Create Source" }),
  );
  await waitFor(() =>
    expect(sourceRows()).toEqual([
      "https://example.dk/undated · publication date unknown",
    ]),
  );
  expect(backend.requests.at(-1)).toEqual({
    method: "POST",
    path: "/api/admin/sources",
    token: validToken,
    body: { url: "https://example.dk/undated", publishedAt: null },
  });
  expect(within(newSourceForm()).getByLabelText("Source URL")).toHaveProperty(
    "value",
    "",
  );

  type("Source URL", "https://example.dk/dated", newSourceForm());
  type("Publication date", "2025-03-09", newSourceForm());
  expect(
    within(newSourceForm()).getByLabelText("Publication date"),
  ).toHaveProperty("type", "date");
  fireEvent.click(
    within(newSourceForm()).getByRole("button", { name: "Create Source" }),
  );
  await waitFor(() =>
    expect(sourceRows()).toEqual([
      "https://example.dk/undated · publication date unknown",
      "https://example.dk/dated · published 2025-03-09",
    ]),
  );
  expect(backend.requests.at(-1)).toMatchObject({
    body: {
      url: "https://example.dk/dated",
      publishedAt: "2025-03-09T00:00:00.000Z",
    },
  });
});

test("creating a Source keeps the search and confirms it, saying when the search hides it", async () => {
  await openSources(fakeBackend([], { sources: [lawSource, guideSource] }));
  type("Find Sources by URL", "nyidanmark", finder());

  type("Source URL", "https://example.dk/new", newSourceForm());
  fireEvent.click(
    within(newSourceForm()).getByRole("button", { name: "Create Source" }),
  );

  const status = within(finder()).getByRole("status");
  await waitFor(() =>
    expect(status.textContent).toBe(
      "Source created: https://example.dk/new. It doesn't match the current search, so it isn't listed.",
    ),
  );
  expect(within(finder()).getByLabelText("Find Sources by URL")).toHaveProperty(
    "value",
    "nyidanmark",
  );
  expect(sourceRows()).toEqual([
    `${guideSource.url} · publication date unknown`,
  ]);

  type("Find Sources by URL", "", finder());
  expect(status.textContent).toBe("Source created: https://example.dk/new.");
  expect(sourceRows()).toContain(
    "https://example.dk/new · publication date unknown",
  );
});

test("a failed Source create shows the error, keeps the input, and clears the last confirmation", async () => {
  const backend = fakeBackend();
  await openSources(backend);
  type("Source URL", "https://example.dk/first", newSourceForm());
  fireEvent.click(
    within(newSourceForm()).getByRole("button", { name: "Create Source" }),
  );
  await within(finder()).findByText(
    "Source created: https://example.dk/first.",
  );
  backend.network.bff = () => Promise.reject(new TypeError("Failed to fetch"));

  type("Source URL", "https://example.dk/offline", newSourceForm());
  fireEvent.click(
    within(newSourceForm()).getByRole("button", { name: "Create Source" }),
  );

  await within(newSourceForm()).findByRole("alert");
  expect(within(newSourceForm()).getByLabelText("Source URL")).toHaveProperty(
    "value",
    "https://example.dk/offline",
  );
  expect(within(finder()).getByRole("status").textContent).toBe("");
});

test("a blank Source URL is rejected before submission", async () => {
  const backend = fakeBackend();
  await openSources(backend);
  const sent = backend.requests.length;

  fireEvent.click(
    within(newSourceForm()).getByRole("button", { name: "Create Source" }),
  );
  expect(fieldError("Source URL", newSourceForm())).toBe(
    "Source URL must not be blank.",
  );
  expect(backend.requests.length).toBe(sent);
});

test("a duplicate URL says the Source exists, shows it, and points to attaching it from a Draft", async () => {
  await openSources(fakeBackend([], { sources: [lawSource, guideSource] }));

  type("Source URL", guideSource.url, newSourceForm());
  fireEvent.click(
    within(newSourceForm()).getByRole("button", { name: "Create Source" }),
  );

  const alert = await within(newSourceForm()).findByRole("alert");
  expect(alert.textContent).toContain("A Source with this URL already exists.");
  expect(alert.textContent).toContain("attach it from a Draft Lesson");
  expect(alert.textContent).toContain("req-409-source");
  expect(sourceRows()).toEqual([
    `${guideSource.url} · publication date unknown`,
  ]);
  expect(within(newSourceForm()).getByLabelText("Source URL")).toHaveProperty(
    "value",
    guideSource.url,
  );
  expect(
    within(finder()).queryByRole("button", { name: /^Attach/ }),
  ).toBeNull();
});

test("an uncreated New Source warns before leaving the Sources screen", async () => {
  const confirm = vi
    .spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  await openSources(fakeBackend());

  type("Source URL", "https://example.dk/half-typed", newSourceForm());
  expect(unloadBlocked()).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  expect(confirm).toHaveBeenCalledExactlyOnceWith(
    "Unsaved changes in New Source will be discarded. Leave anyway?",
  );
  expect(within(newSourceForm()).getByLabelText("Source URL")).toHaveProperty(
    "value",
    "https://example.dk/half-typed",
  );

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  await screen.findByRole("button", { name: "Sources" });
  expect(unloadBlocked()).toBe(false);
});
