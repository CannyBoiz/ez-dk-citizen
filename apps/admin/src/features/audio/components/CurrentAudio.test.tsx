// Showing and playing the current Lesson Audio for the selected Language, and the narration
// warning that depends on knowing it (ticket 08).
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { App } from "../../../app/App";
import {
  validToken,
  connect,
  lessonDetail,
  fakeBackend,
  openLesson,
  type,
  structureForm,
  tab,
  textForm,
  thaiText,
  storedAudio,
  hold,
  storageOutage,
  uploadButton,
  mp3File,
  uploadPanel,
  chooseFile,
  danishText,
  firstOnly,
  settle,
} from "../../../shared/test/support";

function audioPanel() {
  return screen.getByRole("region", { name: "Current audio" });
}

function player() {
  return within(audioPanel()).getByLabelText("Current audio player") as HTMLAudioElement;
}

function audioRequests(backend: ReturnType<typeof fakeBackend>) {
  return backend.requests.filter((request) => request.path.includes("/audio/")).map((request) => request.path);
}

// The narration warning in the selected Language's tab, if shown.
function narrationWarning() {
  return within(screen.getByRole("tabpanel")).queryByRole("status");
}

function findNarrationWarning() {
  return within(screen.getByRole("tabpanel")).findByRole("status");
}

async function open(backend: ReturnType<typeof fakeBackend>) {
  render(<App network={backend.network} />);
  await connect(validToken);
  await openLesson(1, 1);
}

test.each(["DRAFT", "PUBLISHED", "ARCHIVED"] as const)(
  "a %s Lesson shows the current audio of the selected Language with a native player",
  async (status) => {
    const backend = fakeBackend([lessonDetail(1, { status, lessonTexts: [thaiText] })], {
      audio: { "1:th": storedAudio({ audioVersion: 2, originalFilename: "chapter-1-th.mp3" }) },
    });
    await open(backend);

    await within(audioPanel()).findByText("Audio version 2 · chapter-1-th.mp3 · 3.0 MiB");
    expect(player().controls).toBe(true);
    expect(player().getAttribute("src")).toBe("https://s3.invalid/audio/41.mp3?playback=1");
    expect(audioRequests(backend)).toEqual(["/api/admin/lessons/1/audio/th"]);

    fireEvent.click(tab("da"));
    await within(audioPanel()).findByText("No audio yet for this Language.");
    expect(within(audioPanel()).queryByLabelText("Current audio player")).toBeNull();
    expect(audioRequests(backend)).toEqual(["/api/admin/lessons/1/audio/th", "/api/admin/lessons/1/audio/da"]);
  },
);

test("an audio load error stays in the audio panel, keeps unsaved edits, and Reload audio recovers", async () => {
  let outage = true;
  const backend = fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })], {
    audio: { "1:th": storedAudio() },
    override: (request) =>
      request.path.includes("/audio/") && outage
        ? storageOutage("req-503-audio")
        : undefined,
  });
  await open(backend);
  type("Version", "7", structureForm());

  const alert = await within(audioPanel()).findByRole("alert");
  expect(alert.textContent).toContain("Storage is unavailable.");
  expect(alert.textContent).toContain("req-503-audio");
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(within(structureForm()).getByLabelText("Version")).toHaveProperty("value", "7");

  outage = false;
  fireEvent.click(within(audioPanel()).getByRole("button", { name: "Reload audio" }));
  await within(audioPanel()).findByLabelText("Current audio player");
  expect(within(audioPanel()).queryByRole("alert")).toBeNull();
  expect(within(structureForm()).getByLabelText("Version")).toHaveProperty("value", "7");
});

test("a playback failure is reported in the audio panel and Reload audio fetches a fresh Playback URL", async () => {
  const backend = fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })], { audio: { "1:th": storedAudio() } });
  await open(backend);
  await within(audioPanel()).findByLabelText("Current audio player");
  const expired = player().getAttribute("src");

  fireEvent.error(player());
  expect((await within(audioPanel()).findByRole("alert")).textContent).toContain("Reload audio");

  fireEvent.click(within(audioPanel()).getByRole("button", { name: "Reload audio" }));
  await waitFor(() => expect(player().getAttribute("src")).not.toBe(expired));
  expect(player().getAttribute("src")).toBe("https://s3.invalid/audio/41.mp3?playback=2");
  expect(within(audioPanel()).queryByRole("alert")).toBeNull();
});

test("Playback URLs are never refreshed in the background", async () => {
  const backend = fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })], { audio: { "1:th": storedAudio() } });
  await open(backend);
  await within(audioPanel()).findByLabelText("Current audio player");
  const sent = backend.requests.length;

  vi.useFakeTimers();
  try {
    await act(async () => vi.advanceTimersByTime(3 * 60 * 60 * 1000));
  } finally {
    vi.useRealTimers();
  }
  expect(backend.requests.length).toBe(sent);
});

test("saving Lesson Text in a Language with current audio warns that the narration may not match", async () => {
  const backend = fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })], {
    audio: { "1:th": storedAudio({ audioVersion: 3 }) },
  });
  await open(backend);
  await within(audioPanel()).findByText(/^Audio version 3/);
  const audioReads = audioRequests(backend).length;

  type("Content", "เนื้อหาใหม่", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));

  expect((await findNarrationWarning()).textContent).toContain(
    "The current th audio may no longer match it",
  );
  expect(within(audioPanel()).getByText(/^Audio version 3/)).toBeTruthy();
  expect(audioRequests(backend).length).toBe(audioReads);

  fireEvent.click(tab("da"));
  await within(audioPanel()).findByText("No audio yet for this Language.");
  type("Title", "Kapitel 1", textForm());
  type("Content", "Indhold", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(tab("da").textContent).toBe("da: Saved"));
  expect(narrationWarning()).toBeNull();
});

test("the narration warning checks the backend when the audio panel could not tell", async () => {
  let outage = true;
  const backend = fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })], {
    audio: { "1:th": storedAudio() },
    override: (request) =>
      request.path.includes("/audio/") && outage
        ? storageOutage("req-503-audio")
        : undefined,
  });
  await open(backend);
  await within(audioPanel()).findByRole("alert");
  const save = () => fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));

  type("Content", "แก้ไขครั้งแรก", textForm());
  save();
  expect((await findNarrationWarning()).textContent).toContain("Could not check for th audio");

  outage = false;
  type("Content", "แก้ไขครั้งที่สอง", textForm());
  save();
  await waitFor(async () =>
    expect((await findNarrationWarning()).textContent).toContain("The current th audio may no longer match it"),
  );
  expect(audioRequests(backend).at(-1)).toBe("/api/admin/lessons/1/audio/th");
});

test("after an upload replaces 'no audio', saving text warns even if the audio panel cannot reload", async () => {
  let completed = false;
  const backend = fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })], {
    override: (request) => {
      if (request.path.endsWith("/complete")) completed = true;
      else if (completed && request.path.includes("/audio/"))
        return storageOutage("req-503-audio");
    },
  });
  await open(backend);
  await within(audioPanel()).findByText("No audio yet for this Language.");

  chooseFile(mp3File());
  fireEvent.click(uploadButton());
  await waitFor(() => expect(backend.uploads).toHaveLength(1));
  backend.uploads[0]!.finish(200);
  await within(uploadPanel()).findByText(/^Upload complete/);
  await within(audioPanel()).findByRole("alert");

  type("Content", "เนื้อหาหลังอัปโหลด", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  expect((await findNarrationWarning()).textContent).toContain(
    "The current th audio may no longer match it",
  );
});

test("checking for audio after a save never holds the saved form", async () => {
  let outage = true;
  const backend = fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })], {
    audio: { "1:th": storedAudio() },
    override: (request) =>
      request.path.includes("/audio/") && outage
        ? storageOutage("req-503-audio")
        : undefined,
  });
  await open(backend);
  await within(audioPanel()).findByRole("alert");
  outage = false;
  const releaseCheck = hold(backend.network, (request) => request.path.includes("/audio/"), "response");

  type("Content", "เนื้อหาใหม่", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(tab("th").textContent).toBe("th: Saved"));
  await waitFor(() => expect(within(textForm()).getByLabelText("Content")).toHaveProperty("readOnly", false));
  expect(within(textForm()).getByRole("button", { name: "Save" })).toHaveProperty("disabled", false);
  expect(narrationWarning()).toBeNull();

  releaseCheck();
  expect((await findNarrationWarning()).textContent).toContain(
    "The current th audio may no longer match it",
  );
});

test("each Language keeps its own narration warning while slower checks finish", async () => {
  let thaiOutage = true;
  const backend = fakeBackend([lessonDetail(1, { lessonTexts: [thaiText, danishText] })], {
    audio: { "1:th": storedAudio(), "1:da": storedAudio({ mediaAssetId: 42, originalFilename: "da.mp3" }) },
    override: (request) =>
      request.path.endsWith("/audio/th") && thaiOutage ? storageOutage("req-503-audio") : undefined,
  });
  await open(backend);
  await within(audioPanel()).findByRole("alert");
  thaiOutage = false;
  const releaseThaiCheck = hold(backend.network, (request) => request.path.endsWith("/audio/th"), "response");

  type("Content", "เนื้อหาใหม่", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(tab("th").textContent).toBe("th: Saved"));

  fireEvent.click(tab("da"));
  await within(audioPanel()).findByText(/^Audio version 1 · da\.mp3/);
  type("Content", "Nyt indhold", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(narrationWarning()?.textContent).toContain("The current da audio may no longer match it"));

  releaseThaiCheck();
  await settle();
  expect(narrationWarning()?.textContent).toContain("The current da audio may no longer match it");
  fireEvent.click(tab("th"));
  expect(narrationWarning()?.textContent).toContain("The current th audio may no longer match it");
});

test("a failed re-read turns a remembered 'no audio' back into unknown", async () => {
  let outage = false;
  const backend = fakeBackend([lessonDetail(1, { lessonTexts: [thaiText, danishText] })], {
    override: (request) =>
      request.path.endsWith("/audio/th") && outage ? storageOutage("req-503-audio") : undefined,
  });
  await open(backend);
  await within(audioPanel()).findByText("No audio yet for this Language.");

  // Audio arrives from elsewhere, and the next Thai read fails.
  backend.currentAudio["1:th"] = storedAudio();
  outage = true;
  fireEvent.click(tab("da"));
  await within(audioPanel()).findByText("No audio yet for this Language.");
  fireEvent.click(tab("th"));
  await within(audioPanel()).findByRole("alert");

  outage = false;
  type("Content", "เนื้อหาใหม่", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  expect((await findNarrationWarning()).textContent).toContain(
    "The current th audio may no longer match it",
  );
});

test("a read answered after an upload completes cannot hide the new audio from the warning", async () => {
  const backend = fakeBackend([lessonDetail(1, { lessonTexts: [thaiText, danishText] })]);
  await open(backend);
  await within(audioPanel()).findByText("No audio yet for this Language.");
  fireEvent.click(tab("da"));
  await within(audioPanel()).findByText("No audio yet for this Language.");
  // Only the next Thai read is held: it answers "no audio" after the upload completes.
  const releaseOldRead = hold(
    backend.network,
    firstOnly((request) => request.path.endsWith("/audio/th")),
    "response",
  );
  fireEvent.click(tab("th"));

  chooseFile(mp3File());
  fireEvent.click(uploadButton());
  await waitFor(() => expect(backend.uploads).toHaveLength(1));
  backend.uploads[0]!.finish(200);
  await within(uploadPanel()).findByText(/^Upload complete/);
  releaseOldRead();
  await settle();

  type("Content", "เนื้อหาหลังอัปโหลด", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  expect((await findNarrationWarning()).textContent).toContain(
    "The current th audio may no longer match it",
  );
});

test("a save answered after an upload completes checks what is known then", async () => {
  const backend = fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })]);
  await open(backend);
  await within(audioPanel()).findByText("No audio yet for this Language.");

  chooseFile(mp3File());
  fireEvent.click(uploadButton());
  await waitFor(() => expect(backend.uploads).toHaveLength(1));
  const releaseSave = hold(backend.network, (request) => request.method === "PUT", "response");
  type("Content", "แก้ไขระหว่างอัปโหลด", textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(backend.requests.some((request) => request.method === "PUT")).toBe(true));

  backend.uploads[0]!.finish(200);
  await within(uploadPanel()).findByText(/^Upload complete/);
  releaseSave();
  expect((await findNarrationWarning()).textContent).toContain(
    "The current th audio may no longer match it",
  );
});
