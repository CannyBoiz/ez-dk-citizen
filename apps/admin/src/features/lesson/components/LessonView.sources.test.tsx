// Citing Sources from the Lesson editor: attach, reference editing, and detach (ticket 06).
import type { SourceResponse } from "@ez-dk-citizen/api-contracts/schemas";
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
  guideSource as guide,
  hold,
  lawSource as law,
  lessonDetail,
  newSourceForm,
  openLesson,
  problem,
  settle,
  structureForm,
  textForm,
  thaiText,
  type,
  unloadBlocked,
  validToken,
} from "../../../shared/test/support";

const cited = (source: SourceResponse, overrides = {}) => ({
  ...source,
  pageFrom: null,
  pageTo: null,
  sectionReference: null,
  ...overrides,
});

function attachButton(url: string) {
  return within(finder()).getByRole("button", { name: `Attach ${url}` });
}

function lessonSourceForm(url: string) {
  return screen.getByRole("form", { name: `Lesson Source ${url}` });
}

function lessonSourceUrls() {
  return screen
    .queryAllByRole("form", { name: /^Lesson Source / })
    .map((form) =>
      form.getAttribute("aria-label")!.slice("Lesson Source ".length),
    );
}

async function openDraft(backend: ReturnType<typeof fakeBackend>) {
  render(<App network={backend.network} />);
  await connect(validToken);
  await openLesson(1, 1);
}

async function createSource(url: string) {
  type("Source URL", url, newSourceForm());
  fireEvent.click(
    within(newSourceForm()).getByRole("button", { name: "Create Source" }),
  );
  return within(newSourceForm()).findByRole("alert");
}

test("a duplicate URL directs the admin to attach the existing Source", async () => {
  await openDraft(fakeBackend([lessonDetail(1)], { sources: [law, guide] }));

  const alert = await createSource(guide.url);
  expect(alert.textContent).toContain("A Source with this URL already exists.");
  expect(alert.textContent).toContain(
    "Attach the existing Source shown in the list instead.",
  );
  expect(alert.textContent).toContain("req-409-source");
  expect(attachButton(guide.url)).toHaveProperty("disabled", false);
  expect(
    within(finder()).queryByRole("button", { name: `Attach ${law.url}` }),
  ).toBeNull();
});

test("a duplicate URL of an attached Source says it is already attached", async () => {
  await openDraft(
    fakeBackend([lessonDetail(1, { lessonSources: [cited(guide)] })]),
  );

  const alert = await createSource(guide.url);
  expect(alert.textContent).toContain("It is already attached to this Lesson.");
  expect(alert.textContent).not.toContain("Attach the existing Source");
});

test("a duplicate URL is reported at once, without waiting for the Source list to reload", async () => {
  const backend = fakeBackend([
    lessonDetail(1, { lessonSources: [cited(guide)] }),
  ]);
  await openDraft(backend);
  const releaseReload = hold(
    backend.network,
    (request) =>
      request.method === "GET" && request.path === "/api/admin/sources",
  );

  const alert = await createSource(guide.url);
  expect(alert.textContent).toContain("A Source with this URL already exists.");
  expect(alert.textContent).toContain("It is already attached to this Lesson.");
  expect(
    within(newSourceForm()).getByRole("button", { name: "Create Source" }),
  ).toHaveProperty("disabled", false);
  expect(within(newSourceForm()).getByLabelText("Source URL")).toHaveProperty(
    "readOnly",
    false,
  );

  releaseReload();
  await waitFor(() =>
    expect(within(finder()).queryByText("Loading Sources…")).toBeNull(),
  );
  expect(attachButton(guide.url)).toHaveProperty("disabled", true);
});

test("attaching a Source adds it to the Draft's Lesson Sources", async () => {
  const backend = fakeBackend([lessonDetail(1)], { sources: [law, guide] });
  await openDraft(backend);
  expect(screen.getByText("No Lesson Sources.")).toBeTruthy();

  fireEvent.click(attachButton(guide.url));

  await waitFor(() => expect(lessonSourceUrls()).toEqual([guide.url]));
  expect(backend.requests.at(-1)).toEqual({
    method: "PUT",
    path: "/api/admin/lessons/1/sources/2",
    token: validToken,
    body: { pageFrom: null, pageTo: null, sectionReference: null },
  });
  // Re-attaching would reset its references, so an attached Source cannot be attached again.
  expect(attachButton(guide.url)).toHaveProperty("disabled", true);
  expect(attachButton(law.url)).toHaveProperty("disabled", false);
  expect(within(lessonSourceForm(guide.url)).getByText("Saved")).toBeTruthy();
});

test("each Lesson Source saves its own references with saved/unsaved state and navigation warnings", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const backend = fakeBackend([
    lessonDetail(1, {
      lessonSources: [cited(law), cited(guide, { pageFrom: 2 })],
    }),
  ]);
  await openDraft(backend);
  expect(lessonSourceUrls()).toEqual([law.url, guide.url]);
  expect(
    within(lessonSourceForm(guide.url)).getByLabelText("Page from"),
  ).toHaveProperty("value", "2");

  type("Page from", "3", lessonSourceForm(law.url));
  type("Page to", "5", lessonSourceForm(law.url));
  type("Section reference", "§ 2, stk. 1", lessonSourceForm(law.url));
  expect(within(lessonSourceForm(law.url)).getByText("Unsaved")).toBeTruthy();
  expect(within(lessonSourceForm(guide.url)).getByText("Saved")).toBeTruthy();
  expect(unloadBlocked()).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(
    within(lessonSourceForm(law.url)).getByLabelText("Page to"),
  ).toHaveProperty("value", "5");

  type("Page from", "", lessonSourceForm(guide.url));
  expect(within(lessonSourceForm(guide.url)).getByText("Unsaved")).toBeTruthy();

  fireEvent.click(
    within(lessonSourceForm(law.url)).getByRole("button", { name: "Save" }),
  );
  await waitFor(() =>
    expect(within(lessonSourceForm(law.url)).getByText("Saved")).toBeTruthy(),
  );
  expect(backend.requests.at(-1)).toEqual({
    method: "PUT",
    path: "/api/admin/lessons/1/sources/1",
    token: validToken,
    body: { pageFrom: 3, pageTo: 5, sectionReference: "§ 2, stk. 1" },
  });
  expect(within(lessonSourceForm(guide.url)).getByText("Unsaved")).toBeTruthy();
  expect(unloadBlocked()).toBe(true);

  fireEvent.click(
    within(lessonSourceForm(guide.url)).getByRole("button", { name: "Save" }),
  );
  await waitFor(() =>
    expect(within(lessonSourceForm(guide.url)).getByText("Saved")).toBeTruthy(),
  );
  expect(backend.requests.at(-1)).toMatchObject({
    path: "/api/admin/lessons/1/sources/2",
    body: { pageFrom: null, pageTo: null, sectionReference: null },
  });
  await waitFor(() => expect(unloadBlocked()).toBe(false));
});

test("impossible page references are rejected before submission and backend errors attach to their field", async () => {
  const backend = fakeBackend(
    [lessonDetail(1, { lessonSources: [cited(law)] })],
    {
      override: (request) =>
        request.method === "PUT" &&
        (request.body as { sectionReference: string | null })
          .sectionReference === "rejected"
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
                  { path: ["pageTo"], message: "Page to is not acceptable." },
                ],
              },
            }
          : undefined,
    },
  );
  await openDraft(backend);
  const form = lessonSourceForm(law.url);
  const save = () =>
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));
  const sent = backend.requests.length;

  type("Page from", "0", form);
  save();
  expect(fieldError("Page from", form)).toBe(
    "Page from must be a positive whole number.",
  );

  type("Page from", "5", form);
  type("Page to", "4", form);
  save();
  expect(fieldError("Page from", form)).toBeFalsy();
  expect(fieldError("Page to", form)).toBe(
    "Page to must not be below page from.",
  );
  expect(backend.requests.length).toBe(sent);

  type("Page to", "6", form);
  type("Section reference", "rejected", form);
  save();
  await waitFor(() =>
    expect(fieldError("Page to", form)).toBe("Page to is not acceptable."),
  );
  expect(within(form).getByRole("alert").textContent).toContain("req-422");
  expect(within(form).getByLabelText("Page from")).toHaveProperty("value", "5");
  expect(within(form).getByText("Unsaved")).toBeTruthy();
});

test("detaching a Source removes it from the Draft and keeps the canonical Source", async () => {
  const backend = fakeBackend([
    lessonDetail(1, { lessonSources: [cited(law), cited(guide)] }),
  ]);
  await openDraft(backend);

  fireEvent.click(screen.getByRole("button", { name: `Detach ${law.url}` }));

  await waitFor(() => expect(lessonSourceUrls()).toEqual([guide.url]));
  expect(
    backend.requests.find((request) => request.method === "DELETE"),
  ).toEqual({
    method: "DELETE",
    path: "/api/admin/lessons/1/sources/1",
    token: validToken,
  });
  expect(attachButton(law.url)).toHaveProperty("disabled", false);
});

test("detaching a Lesson Source with unsaved references asks before discarding them", async () => {
  const confirm = vi
    .spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  const backend = fakeBackend([
    lessonDetail(1, { lessonSources: [cited(law)] }),
  ]);
  await openDraft(backend);

  type("Section reference", "unsaved", lessonSourceForm(law.url));
  fireEvent.click(screen.getByRole("button", { name: `Detach ${law.url}` }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(backend.requests.some((request) => request.method === "DELETE")).toBe(
    false,
  );
  expect(
    within(lessonSourceForm(law.url)).getByLabelText("Section reference"),
  ).toHaveProperty("value", "unsaved");

  fireEvent.click(screen.getByRole("button", { name: `Detach ${law.url}` }));
  await waitFor(() => expect(lessonSourceUrls()).toEqual([]));
  expect(confirm).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(unloadBlocked()).toBe(false));
});

test("Detach waits for Lesson changes in flight, and changes wait for a detach", async () => {
  const backend = fakeBackend(
    [lessonDetail(1, { lessonSources: [cited(law), cited(guide)] })],
    {
      sources: [bookSource],
    },
  );
  await openDraft(backend);
  const detachLaw = () =>
    screen.getByRole("button", { name: `Detach ${law.url}` });

  const releaseSave = hold(
    backend.network,
    (request) => request.method === "PUT",
    "response",
  );
  type("Page from", "7", lessonSourceForm(guide.url));
  fireEvent.click(
    within(lessonSourceForm(guide.url)).getByRole("button", { name: "Save" }),
  );
  await waitFor(() => expect(detachLaw()).toHaveProperty("disabled", true));
  releaseSave();
  await waitFor(() => expect(detachLaw()).toHaveProperty("disabled", false));

  const releaseDelete = hold(
    backend.network,
    (request) => request.method === "DELETE",
  );
  fireEvent.click(detachLaw());
  await waitFor(() =>
    expect(
      within(lessonSourceForm(guide.url)).getByLabelText("Page from"),
    ).toHaveProperty("readOnly", true),
  );
  expect(
    within(structureForm()).queryByRole("button", { name: "Save" }),
  ).toBeNull();
  expect(attachButton(bookSource.url)).toHaveProperty("disabled", true);
  expect(
    within(screen.getByRole("region", { name: "Publication" })).getByRole(
      "button",
      { name: "Publish" },
    ),
  ).toHaveProperty("disabled", true);

  releaseDelete();
  await waitFor(() => expect(lessonSourceUrls()).toEqual([guide.url]));
  expect(
    within(lessonSourceForm(guide.url)).getByLabelText("Page from"),
  ).toHaveProperty("readOnly", false);
  expect(attachButton(bookSource.url)).toHaveProperty("disabled", false);
  expect(
    within(lessonSourceForm(guide.url)).getByLabelText("Page from"),
  ).toHaveProperty("value", "7");
});

test("a New Source draft keeps its text and its unsaved-changes warnings while a detach runs", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const backend = fakeBackend(
    [lessonDetail(1, { lessonSources: [cited(law)] })],
    { sources: [guide] },
  );
  await openDraft(backend);
  const draftUrl = () => within(newSourceForm()).getByLabelText("Source URL");
  type("Source URL", "https://example.dk/half-typed", newSourceForm());

  const releaseDelete = hold(
    backend.network,
    (request) => request.method === "DELETE",
  );
  fireEvent.click(screen.getByRole("button", { name: `Detach ${law.url}` }));
  await waitFor(() =>
    expect(attachButton(guide.url)).toHaveProperty("disabled", true),
  );

  expect(draftUrl()).toHaveProperty("value", "https://example.dk/half-typed");
  expect(unloadBlocked()).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  expect(confirm).toHaveBeenCalledOnce();

  releaseDelete();
  await waitFor(() => expect(lessonSourceUrls()).toEqual([]));
  expect(attachButton(guide.url)).toHaveProperty("disabled", false);
  expect(draftUrl()).toHaveProperty("value", "https://example.dk/half-typed");
});

test("a Source attached again stays shown when a newer save answers before the attach", async () => {
  const backend = fakeBackend([
    lessonDetail(1, {
      lessonTexts: [thaiText],
      lessonSources: [cited(law), cited(guide)],
    }),
  ]);
  await openDraft(backend);
  fireEvent.click(screen.getByRole("button", { name: `Detach ${law.url}` }));
  await waitFor(() => expect(lessonSourceUrls()).toEqual([guide.url]));

  const releaseAttach = hold(
    backend.network,
    (request) => request.path.endsWith("/sources/1"),
    "response",
  );
  fireEvent.click(attachButton(law.url));
  await waitFor(() =>
    expect(
      backend.requests.some(
        (request) =>
          request.path.endsWith("/sources/1") && request.method === "PUT",
      ),
    ).toBe(true),
  );
  type("Content", "เนื้อหาใหม่", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(lessonSourceUrls()).toEqual([law.url, guide.url]));

  releaseAttach();
  await settle();
  expect(lessonSourceUrls()).toEqual([law.url, guide.url]);
});

test("a failed detach keeps the Lesson Source and shows the error", async () => {
  await openDraft(
    fakeBackend([lessonDetail(1, { lessonSources: [cited(law)] })], {
      override: (request) =>
        request.method === "DELETE"
          ? problem(
              503,
              "data_service_unavailable",
              "The Data Service is unavailable.",
              "req-503",
            )
          : undefined,
    }),
  );

  fireEvent.click(screen.getByRole("button", { name: `Detach ${law.url}` }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("The Data Service is unavailable.");
  expect(alert.textContent).toContain("req-503");
  expect(lessonSourceUrls()).toEqual([law.url]);
});

test("an uncreated New Source counts as an unsaved edit in the Lesson editor", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await openDraft(fakeBackend([lessonDetail(1)]));

  type("Source URL", "https://example.dk/half-typed", newSourceForm());
  expect(unloadBlocked()).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(canonicalEditControls()).toEqual([]);
});

test.each(["PUBLISHED", "ARCHIVED"] as const)(
  "attach, detach, reference editing, and Source creation are disabled for %s Lessons",
  async (status) => {
    await openDraft(
      fakeBackend(
        [
          lessonDetail(1, {
            status,
            lessonSources: [cited(law, { pageFrom: 4 })],
          }),
        ],
        {
          sources: [guide],
        },
      ),
    );

    const form = lessonSourceForm(law.url);
    for (const label of ["Page from", "Page to", "Section reference"])
      expect(within(form).getByLabelText(label)).toHaveProperty(
        "readOnly",
        true,
      );
    expect(within(form).getByLabelText("Page from")).toHaveProperty(
      "value",
      "4",
    );
    expect(within(form).queryByRole("button", { name: "Save" })).toBeNull();
    expect(
      screen.getByRole("button", { name: `Detach ${law.url}` }),
    ).toHaveProperty("disabled", true);
    expect(attachButton(guide.url)).toHaveProperty("disabled", true);
    expect(within(newSourceForm()).getByLabelText("Source URL")).toHaveProperty(
      "readOnly",
      true,
    );
    expect(
      within(newSourceForm()).queryByRole("button", { name: "Create Source" }),
    ).toBeNull();
  },
);
