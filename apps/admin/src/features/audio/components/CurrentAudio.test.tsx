// Showing and playing the current Lesson Audio for the selected Language (ticket 08).
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { App } from "../../../app/App";
import {
  validToken,
  problem,
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
        ? problem(503, "storage_unavailable", "Storage is unavailable.", "req-503-audio")
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

  expect((await within(screen.getByRole("tabpanel")).findByRole("status")).textContent).toContain(
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
  expect(within(screen.getByRole("tabpanel")).queryByRole("status")).toBeNull();
});

test("the narration warning checks the backend when the audio panel could not tell", async () => {
  let outage = true;
  const backend = fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })], {
    audio: { "1:th": storedAudio() },
    override: (request) =>
      request.path.includes("/audio/") && outage
        ? problem(503, "storage_unavailable", "Storage is unavailable.", "req-503-audio")
        : undefined,
  });
  await open(backend);
  await within(audioPanel()).findByRole("alert");
  const save = () => fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  const warning = () => within(screen.getByRole("tabpanel")).findByRole("status");

  type("Content", "แก้ไขครั้งแรก", textForm());
  save();
  expect((await warning()).textContent).toContain("Could not check for th audio");

  outage = false;
  type("Content", "แก้ไขครั้งที่สอง", textForm());
  save();
  await waitFor(async () =>
    expect((await warning()).textContent).toContain("The current th audio may no longer match it"),
  );
  expect(audioRequests(backend).at(-1)).toBe("/api/admin/lessons/1/audio/th");
});
