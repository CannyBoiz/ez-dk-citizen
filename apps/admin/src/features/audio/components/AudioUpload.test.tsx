// Uploading an MP3 for the selected Language with visible progress (ticket 09).
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
  chooseFile,
  connect,
  danishText,
  fakeBackend,
  fileInput,
  hold,
  lawSource,
  lessonDetail,
  mp3File,
  openLesson,
  problem,
  storageOutage,
  tab,
  textForm,
  thaiText,
  type,
  uploadButton,
  uploadPanel,
  validToken,
} from "../../../shared/test/support";

const intentPath = "/api/admin/media/upload-intents";

async function open(backend: ReturnType<typeof fakeBackend>) {
  render(<App network={backend.network} />);
  await connect(validToken);
  await openLesson(1, 1);
}

test("files that are not .mp3, are empty, or exceed 50 MiB are rejected before any request", async () => {
  const backend = fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })]);
  await open(backend);
  const sent = backend.requests.length;

  for (const [file, message] of [
    [mp3File("narration.wav", 2048, "audio/wav"), "Choose an .mp3 file."],
    [mp3File("empty.mp3", 0), "The file is empty."],
    [
      mp3File("huge.mp3", 50 * 1024 * 1024 + 1),
      "The file is larger than 50 MiB.",
    ],
  ] as const) {
    chooseFile(file);
    expect(within(uploadPanel()).getByRole("alert").textContent).toBe(message);
    expect(uploadButton()).toHaveProperty("disabled", true);
  }
  chooseFile(mp3File("exactly-50-mib.mp3", 50 * 1024 * 1024));
  expect(within(uploadPanel()).queryByRole("alert")).toBeNull();
  expect(uploadButton()).toHaveProperty("disabled", false);
  expect(backend.requests.length).toBe(sent);
  expect(backend.uploads).toEqual([]);
});

test("upload waits for the Language's saved, unchanged Lesson Text, and is unavailable on Archived Lessons", async () => {
  await open(fakeBackend([lessonDetail(1)]));

  expect(
    within(uploadPanel()).getByText(
      "Save the th Lesson Text before uploading audio.",
    ),
  ).toBeTruthy();
  expect(fileInput()).toHaveProperty("disabled", true);

  type("Title", thaiText.title, textForm());
  type("Content", thaiText.content, textForm());
  fireEvent.click(within(textForm()).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(fileInput()).toHaveProperty("disabled", false));

  type("Content", "แก้ไขแล้วแต่ยังไม่บันทึก", textForm());
  expect(
    within(uploadPanel()).getByText(
      "Save the th Lesson Text changes before uploading audio.",
    ),
  ).toBeTruthy();
  expect(fileInput()).toHaveProperty("disabled", true);
});

test.each([
  ["PUBLISHED", false],
  ["ARCHIVED", true],
] as const)(
  "upload on a %s Lesson is disabled: %s",
  async (status, disabled) => {
    await open(
      fakeBackend([lessonDetail(1, { status, lessonTexts: [thaiText] })]),
    );
    expect(fileInput()).toHaveProperty("disabled", disabled);
    if (disabled)
      expect(
        within(uploadPanel()).getByText(
          "Uploads are unavailable for Archived Lessons.",
        ),
      ).toBeTruthy();
  },
);

test("an upload goes Uploading with progress, then Finalizing, then Complete, straight to storage", async () => {
  const backend = fakeBackend([lessonDetail(1, { lessonTexts: [thaiText] })]);
  await open(backend);
  await within(
    screen.getByRole("region", { name: "Current audio" }),
  ).findByText("No audio yet for this Language.");
  const file = mp3File("chapter-1.mp3", 2048);

  const releaseIntent = hold(
    backend.network,
    (request) => request.path === intentPath,
  );
  chooseFile(file);
  fireEvent.click(uploadButton());
  expect(within(uploadPanel()).getByRole("status").textContent).toBe(
    "Preparing the upload of chapter-1.mp3…",
  );
  expect(within(uploadPanel()).queryByRole("progressbar")).toBeNull();
  expect(tab("da")).toHaveProperty("disabled", true);

  releaseIntent();
  await waitFor(() => expect(backend.uploads).toHaveLength(1));
  expect(
    backend.requests.find((request) => request.path === intentPath),
  ).toEqual({
    method: "POST",
    path: intentPath,
    token: validToken,
    body: {
      lessonId: 1,
      languageCode: "th",
      originalFilename: "chapter-1.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 2048,
    },
  });
  const [upload] = backend.uploads;
  expect(upload!.url).toBe("https://s3.invalid/audio/100.mp3?signature=upload");
  expect(upload!.headers).toEqual({
    "Content-Type": "audio/mpeg",
    "If-None-Match": "*",
  });
  expect(upload!.file).toBe(file);
  expect(
    backend.requests.some((request) => request.path.includes("s3.invalid")),
  ).toBe(false);
  expect(within(uploadPanel()).getByRole("status").textContent).toBe(
    "Uploading chapter-1.mp3: 0%",
  );

  upload!.onProgress(0.42);
  await waitFor(() =>
    expect(within(uploadPanel()).getByRole("status").textContent).toBe(
      "Uploading chapter-1.mp3: 42%",
    ),
  );
  expect(
    within(uploadPanel()).getByRole("progressbar", { name: "Upload progress" }),
  ).toHaveProperty("value", 42);

  const releaseCompletion = hold(backend.network, (request) =>
    request.path.endsWith("/complete"),
  );
  upload!.finish(200);
  await waitFor(() =>
    expect(within(uploadPanel()).getByRole("status").textContent).toBe(
      "Finalizing the upload…",
    ),
  );
  expect(screen.queryByText(/Upload complete/)).toBeNull();

  releaseCompletion();
  await waitFor(() =>
    expect(within(uploadPanel()).getByRole("status").textContent).toBe(
      "Upload complete: audio version 1 is now current.",
    ),
  );
  expect(
    backend.requests.find((request) => request.path.endsWith("/complete")),
  ).toEqual({
    method: "POST",
    path: "/api/admin/media/100/complete",
    token: validToken,
    body: { lessonId: 1, languageCode: "th" },
  });
  await within(
    screen.getByRole("region", { name: "Current audio" }),
  ).findByText("Audio version 1 · chapter-1.mp3 · 2.0 KiB");
});

test("the Lesson and Language stay locked, and no second upload starts, until the upload settles", async () => {
  const backend = fakeBackend([
    lessonDetail(1, {
      lessonTexts: [thaiText],
      lessonSources: [
        { ...lawSource, pageFrom: null, pageTo: null, sectionReference: null },
      ],
    }),
  ]);
  await open(backend);

  chooseFile(mp3File());
  fireEvent.click(uploadButton());
  await waitFor(() => expect(backend.uploads).toHaveLength(1));

  for (const code of ["da", "en"]) {
    expect(tab(code)).toHaveProperty("disabled", true);
    fireEvent.click(tab(code));
  }
  expect(tab("th").getAttribute("aria-selected")).toBe("true");
  expect(
    screen.getByRole("button", { name: "Back to catalogue" }),
  ).toHaveProperty("disabled", true);
  expect(fileInput()).toHaveProperty("disabled", true);
  expect(uploadButton()).toHaveProperty("disabled", true);
  const publication = screen.getByRole("region", { name: "Publication" });
  expect(
    within(publication).getByRole("button", { name: "Publish" }),
  ).toHaveProperty("disabled", true);
  expect(
    within(publication).getByRole("button", { name: "Archive" }),
  ).toHaveProperty("disabled", true);

  backend.uploads[0]!.finish(200);
  await waitFor(() =>
    expect(within(uploadPanel()).getByRole("status").textContent).toMatch(
      /^Upload complete/,
    ),
  );
  expect(
    backend.requests.filter((request) => request.path === intentPath),
  ).toHaveLength(1);
  expect(
    backend.requests.find((request) => request.path.endsWith("/complete"))
      ?.body,
  ).toEqual({
    lessonId: 1,
    languageCode: "th",
  });
  expect(tab("da")).toHaveProperty("disabled", false);
  expect(
    within(publication).getByRole("button", { name: "Publish" }),
  ).toHaveProperty("disabled", false);
});

test.each([
  [
    "the Upload Intent is refused",
    { intent: true },
    "Upload of chapter-1.mp3 for th failed: The Data Service is unavailable.",
  ],
  [
    "the storage PUT errors",
    { put: "error" },
    "Upload of chapter-1.mp3 for th failed (Media Asset 100): The upload to storage did not complete.",
  ],
  [
    "storage rejects the PUT",
    { put: 403 },
    "Upload of chapter-1.mp3 for th failed (Media Asset 100): Storage rejected the upload with status 403.",
  ],
  [
    "completion fails",
    { complete: true },
    "Upload of chapter-1.mp3 for th failed (Media Asset 100): Storage is unavailable.",
  ],
] as const)(
  "when %s, the panel shows Failed and never success",
  async (_case, failure, message) => {
    const backend = fakeBackend(
      [lessonDetail(1, { lessonTexts: [thaiText] })],
      {
        override: (request) =>
          "intent" in failure && request.path === intentPath
            ? problem(
                502,
                "data_service_unavailable",
                "The Data Service is unavailable.",
                "req-502",
              )
            : "complete" in failure && request.path.endsWith("/complete")
              ? storageOutage()
              : undefined,
      },
    );
    await open(backend);

    chooseFile(mp3File());
    fireEvent.click(uploadButton());
    if (!("intent" in failure)) {
      await waitFor(() => expect(backend.uploads).toHaveLength(1));
      if (!("put" in failure)) backend.uploads[0]!.finish(200);
      else if (failure.put === "error") backend.uploads[0]!.fail();
      else backend.uploads[0]!.finish(failure.put);
    }

    expect(
      (await within(uploadPanel()).findByRole("alert")).textContent,
    ).toContain(message);
    expect(screen.queryByText(/Upload complete/)).toBeNull();
    if ("put" in failure)
      expect(
        backend.requests.some((request) => request.path.endsWith("/complete")),
      ).toBe(false);
    expect(tab("da")).toHaveProperty("disabled", false);
  },
);

test("after a failure, only Start new upload begins another Upload Intent, and the failure survives a Language switch", async () => {
  const backend = fakeBackend([
    lessonDetail(1, { lessonTexts: [thaiText, danishText] }),
  ]);
  await open(backend);
  const intents = () =>
    backend.requests.filter((request) => request.path === intentPath);

  chooseFile(mp3File());
  fireEvent.click(uploadButton());
  await waitFor(() => expect(backend.uploads).toHaveLength(1));
  backend.uploads[0]!.fail();
  await within(uploadPanel()).findByRole("alert");

  expect(uploadButton()).toHaveProperty("disabled", true);
  expect(fileInput()).toHaveProperty("disabled", true);
  fireEvent.click(uploadButton());
  expect(intents()).toHaveLength(1);

  fireEvent.click(tab("da"));
  expect(within(uploadPanel()).getByRole("alert").textContent).toContain(
    "Upload of chapter-1.mp3 for th failed (Media Asset 100)",
  );
  fireEvent.click(tab("th"));

  fireEvent.click(
    within(uploadPanel()).getByRole("button", { name: "Start new upload" }),
  );
  expect(within(uploadPanel()).queryByRole("alert")).toBeNull();
  expect(uploadButton()).toHaveProperty("disabled", true);
  chooseFile(mp3File("retake.mp3"));
  fireEvent.click(uploadButton());
  await waitFor(() => expect(intents()).toHaveLength(2));
  expect(intents()[1]!.body).toMatchObject({
    languageCode: "th",
    originalFilename: "retake.mp3",
  });
});

test("a file chosen for one Language is cleared when another Language is selected", async () => {
  const backend = fakeBackend([
    lessonDetail(1, { lessonTexts: [thaiText, danishText] }),
  ]);
  await open(backend);

  chooseFile(mp3File());
  expect(uploadButton()).toHaveProperty("disabled", false);
  fireEvent.click(tab("da"));
  expect(uploadButton()).toHaveProperty("disabled", true);
  expect(within(uploadPanel()).getByRole("heading").textContent).toBe(
    "Upload audio (da)",
  );
});
