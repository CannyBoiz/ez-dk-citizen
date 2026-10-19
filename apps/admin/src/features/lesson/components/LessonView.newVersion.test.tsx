// Create new version on Published and Archived Lessons: the create form with the chapter fixed
// and what will be copied, and the copy's editor with its shared audio (Stage 4b ticket 08).
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
  chooseFile,
  cited,
  confirmation,
  connect,
  danishText,
  editSource,
  fakeBackend,
  guideSource,
  lawSource,
  lessonDetail,
  movedLawUrl,
  mp3File,
  openLesson,
  problem,
  settle,
  storageOutage,
  storedAudio,
  tab,
  textForm,
  type,
  uploadButton,
  uploadPanel,
  validToken,
} from "../../../shared/test/support";

// Chapter 3's Published version 2.1: Danish and Thai Lesson Texts, two Lesson Sources, and
// current Thai audio, but no Danish audio and no English Lesson Text.
const thaiText = { languageCode: "th", title: "บทที่ 3", content: "เนื้อหา" };
const published = lessonDetail(1, {
  chapter: 3,
  version: 2,
  versionPatch: 1,
  status: "PUBLISHED",
  availableLanguageCodes: ["da", "th"],
  lessonTexts: [danishText, thaiText],
  lessonSources: [cited(lawSource, { pageFrom: 4 }), cited(guideSource)],
});
const thaiAudio = storedAudio({
  mediaAssetId: 41,
  audioVersion: 2,
  originalFilename: "chapter-3-th.mp3",
});

function backendWith(lessons = [published]) {
  return fakeBackend(lessons, { audio: { "1:th": thaiAudio } });
}

async function open(backend: ReturnType<typeof fakeBackend>, lesson: string) {
  render(<App network={backend.network} />);
  await connect(validToken);
  await openLesson(lesson);
  return backend;
}

function newVersionForm() {
  return screen.getByRole("form", { name: "New version" });
}

function copyList() {
  return within(newVersionForm())
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

test("Create new version is offered on Published and Archived Lessons only", async () => {
  const backend = backendWith([
    published,
    lessonDetail(2, { chapter: 3 }),
    lessonDetail(3, {
      chapter: 3,
      version: 1,
      versionPatch: 0,
      status: "ARCHIVED",
    }),
  ]);
  await open(backend, "Chapter 3, version 2.1");
  expect(
    screen.getByRole("button", { name: "Create new version" }),
  ).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  await openLesson("Chapter 3, version 1.0");
  expect(
    screen.getByRole("button", { name: "Create new version" }),
  ).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  await openLesson("Chapter 3 · Draft, created 11 Oct 2026");
  expect(
    screen.queryByRole("button", { name: "Create new version" }),
  ).toBeNull();
});

test("the new version form fixes the chapter and lists what will be copied, sending nothing", async () => {
  const backend = await open(backendWith(), "Chapter 3, version 2.1");
  const sent = backend.requests.length;

  fireEvent.click(screen.getByRole("button", { name: "Create new version" }));

  const form = newVersionForm();
  const chapter = within(form).getByLabelText("Chapter") as HTMLInputElement;
  expect(chapter.value).toBe("3");
  expect(chapter.readOnly).toBe(true);
  expect(await within(form).findByText("Current audio: th")).toBeTruthy();
  expect(copyList()).toEqual([
    "Lesson Texts: da, th",
    "Lesson Sources: 2",
    "Current audio: th",
  ]);
  await settle();
  expect(
    backend.requests.slice(sent).filter((request) => request.method !== "GET"),
  ).toEqual([]);

  // Nothing typed, so Cancel closes at once, and Create new version comes back.
  fireEvent.click(within(form).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("form", { name: "New version" })).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Create new version" }),
  );
});

test("confirming creates the copy and opens its editor, where the copied audio plays at once", async () => {
  const backend = await open(backendWith(), "Chapter 3, version 2.1");
  fireEvent.click(screen.getByRole("button", { name: "Create new version" }));
  const form = newVersionForm();
  await within(form).findByText("Current audio: th");

  fireEvent.click(
    within(form).getByRole("button", { name: "Create new version" }),
  );
  expect(confirmation(form).textContent).toContain(
    "Create a new Draft of chapter 3, copied from version 2.1?",
  );
  await settle();
  expect(backend.requests.filter(({ method }) => method === "POST")).toEqual(
    [],
  );

  answer("Create new version", form);

  await screen.findByRole("heading", {
    name: "Chapter 3 · Draft, created 11 Oct 2026",
  });
  expect(backend.requests.filter(({ method }) => method === "POST")).toEqual([
    {
      method: "POST",
      path: "/api/admin/lessons",
      token: validToken,
      body: { copyFromLessonId: 1 },
    },
  ]);
  await screen.findByText("Audio version 1 · chapter-3-th.mp3 · 3.0 MiB");
  expect(
    screen.getByLabelText("Current audio player").getAttribute("src"),
  ).toMatch(/^https:\/\/s3\.invalid\/audio\/41\.mp3\?playback=/);
  expect(backend.uploads).toEqual([]);
});

test("the copy list says which Languages' audio could not be checked", async () => {
  const backend = fakeBackend([published], {
    audio: { "1:th": thaiAudio },
    override: (request) =>
      request.path === "/api/admin/lessons/1/audio/th"
        ? storageOutage()
        : undefined,
  });
  await open(backend, "Chapter 3, version 2.1");

  fireEvent.click(screen.getByRole("button", { name: "Create new version" }));

  expect(
    await within(newVersionForm()).findByText(
      "Current audio: none (could not check th)",
    ),
  ).toBeTruthy();
});

test("a refused copy shows the Backend's error in the form, keeps the editor open, and can be retried", async () => {
  let outage = true;
  const backend = fakeBackend([published], {
    audio: { "1:th": thaiAudio },
    override: (request) =>
      request.method === "POST" && outage
        ? problem(
            503,
            "database_unavailable",
            "The database is unavailable.",
            "req-503",
          )
        : undefined,
  });
  await open(backend, "Chapter 3, version 2.1");
  fireEvent.click(screen.getByRole("button", { name: "Create new version" }));
  const form = newVersionForm();
  const create = () => {
    fireEvent.click(
      within(form).getByRole("button", { name: "Create new version" }),
    );
    answer("Create new version", form);
  };

  create();

  const alert = await within(form).findByRole("alert");
  expect(alert.textContent).toContain("The database is unavailable.");
  expect(alert.textContent).toContain("req-503");
  expect(
    screen.getByRole("heading", { name: "Chapter 3, version 2.1" }),
  ).toBeTruthy();

  outage = false;
  create();
  await screen.findByRole("heading", {
    name: "Chapter 3 · Draft, created 11 Oct 2026",
  });
});

test("Create new version waits for an upload in progress, and its confirmation says what leaving discards", async () => {
  const backend = await open(backendWith(), "Chapter 3, version 2.1");
  const opener = () =>
    screen.getByRole("button", { name: "Create new version" });

  chooseFile(mp3File("chapter-3-correction.mp3"));
  fireEvent.click(uploadButton());
  await waitFor(() => expect(backend.uploads).toHaveLength(1));
  expect(opener()).toHaveProperty("disabled", true);
  backend.uploads.at(0)?.finish(200);
  await within(uploadPanel()).findByText(
    "Upload complete: audio version 3 is now current.",
  );
  expect(opener()).toHaveProperty("disabled", false);

  type("Source URL", movedLawUrl, editSource(lawSource.url));
  fireEvent.click(opener());
  const form = newVersionForm();
  fireEvent.click(
    within(form).getByRole("button", { name: "Create new version" }),
  );
  expect(confirmation(form).textContent).toContain(
    `Create a new Draft of chapter 3, copied from version 2.1? Unsaved changes in Source ${lawSource.url} will be discarded.`,
  );
});

// Opens chapter 3's new version, copied from its Published version 2.1.
async function openCopy(backend = backendWith()) {
  await open(backend, "Chapter 3, version 2.1");
  fireEvent.click(screen.getByRole("button", { name: "Create new version" }));
  const form = newVersionForm();
  await within(form).findByText("Current audio: th");
  fireEvent.click(
    within(form).getByRole("button", { name: "Create new version" }),
  );
  answer("Create new version", form);
  await screen.findByRole("heading", {
    name: "Chapter 3 · Draft, created 11 Oct 2026",
  });
  await screen.findByText(/^Audio version 1 · chapter-3-th\.mp3/);
  return backend;
}

test("saving a Lesson Text in a Language with copied audio shows the narration warning", async () => {
  await openCopy();
  const narrationWarning = () =>
    within(screen.getByRole("tabpanel")).queryByRole("status");

  type("Content", "เนื้อหาที่แก้ไข", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(narrationWarning()?.textContent).toContain(
      "The current th audio may no longer match it",
    ),
  );

  // The Danish Lesson Text was copied without audio, so it warns of nothing.
  fireEvent.click(tab("da"));
  await screen.findByText("No audio yet for this Language.");
  type("Content", "Rettet indhold", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(tab("da").textContent).toBe("da: Saved"));
  await settle();
  expect(narrationWarning()).toBeNull();
});
