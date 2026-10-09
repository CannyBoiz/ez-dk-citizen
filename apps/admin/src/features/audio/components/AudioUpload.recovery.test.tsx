// Recovering an interrupted upload on the page, without false success or a silent second
// Upload Intent (ticket 10).

import type { LessonDetail } from "@ez-dk-citizen/api-contracts/schemas";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { App } from "../../../app/App";
import type { BffRequest, BffResponse } from "../../../shared/lib/network";
import {
  chooseFile,
  connect,
  fakeBackend,
  firstOnly,
  hold,
  lawSource,
  lessonDetail,
  mp3File,
  openLesson,
  problem,
  settle,
  storageOutage,
  thaiText,
  unloadBlocked,
  uploadButton,
  uploadPanel,
  validToken,
} from "../../../shared/test/support";

const intentPath = "/api/admin/media/upload-intents";
const isCompletion = (request: BffRequest) =>
  request.path.endsWith("/complete");

// Answers the first request that `matches` with `response`; a TypeError sends it but no answer
// arrives, as when the network fails.
function failFirst(
  matches: (request: BffRequest) => boolean,
  response: BffResponse | TypeError,
) {
  return { matches: firstOnly(matches), response };
}

// Opens Lesson 1, with a saved Thai Lesson Text, on a backend that fails as `failure` says.
async function open(
  failure?: ReturnType<typeof failFirst>,
  lesson: Partial<LessonDetail> = {},
) {
  const backend = fakeBackend(
    [lessonDetail(1, { lessonTexts: [thaiText], ...lesson })],
    {
      override: (request) => {
        if (!failure?.matches(request)) return undefined;
        // The fake network has already recorded the request, so throwing leaves it unanswered.
        if (failure.response instanceof TypeError) throw failure.response;
        return failure.response;
      },
    },
  );
  render(<App network={backend.network} />);
  await connect(validToken);
  await openLesson(1, 1);
  return {
    ...backend,
    intents: () =>
      backend.requests.filter((request) => request.path === intentPath),
    completions: () => backend.requests.filter(isCompletion),
  };
}

// Starts an upload and waits for its storage PUT.
async function startUpload(backend: { uploads: unknown[] }) {
  chooseFile(mp3File());
  fireEvent.click(uploadButton());
  await waitFor(() => expect(backend.uploads).toHaveLength(1));
}

const button = (name: string) =>
  within(uploadPanel()).queryByRole("button", { name });
const alert = () => within(uploadPanel()).findByRole("alert");
const completeMessage = "Upload complete: audio version 1 is now current.";
const retryable =
  "The file reached storage but was not finalized. Retry finalization to make it current.";
const uncertain =
  "It is not known whether the file reached storage. Check the upload to find out.";
const terminal = "A new upload is required.";

test.each([
  [
    "the Data Service is unavailable",
    problem(
      502,
      "data_service_unavailable",
      "The Data Service is unavailable.",
      "req-502",
    ),
  ],
  ["storage is unavailable", storageOutage()],
  [
    "storage times out",
    problem(504, "storage_timeout", "Storage timed out.", "req-504"),
  ],
  ["the network fails", new TypeError("Failed to fetch")],
  ["its answer is unreadable", { status: 200, body: {} }],
] as const)(
  "when completion fails because %s, Retry finalization completes the same Media Asset without uploading again",
  async (_case, response) => {
    const backend = await open(failFirst(isCompletion, response));
    await startUpload(backend);
    backend.uploads[0]!.finish(200);

    const failure = (await alert()).textContent;
    expect(failure).toContain(
      "Upload of chapter-1.mp3 for th failed (Media Asset 100)",
    );
    expect(failure).toContain(retryable);
    expect(screen.queryByText(/Upload complete/)).toBeNull();
    expect(button("Check upload / Retry finalization")).toBeNull();
    expect(button("Start new upload")).not.toBeNull();

    fireEvent.click(button("Retry finalization")!);
    await within(uploadPanel()).findByText(completeMessage);
    expect(backend.intents()).toHaveLength(1);
    expect(backend.uploads).toHaveLength(1);
    expect(
      backend.completions().map(({ path, body }) => ({
        path,
        body,
      })),
    ).toEqual(
      Array(2).fill({
        path: "/api/admin/media/100/complete",
        body: { lessonId: 1, languageCode: "th" },
      }),
    );
    await within(
      screen.getByRole("region", { name: "Current audio" }),
    ).findByText("Audio version 1 · chapter-1.mp3 · 2.0 KiB");
  },
);

test.each([
  ["errors", "error"],
  ["is refused by storage", 503],
] as const)(
  "when the storage PUT %s, Check upload / Retry finalization lets completion decide, with the same Media Asset ID",
  async (_case, outcome) => {
    const backend = await open();
    await startUpload(backend);
    if (outcome === "error") backend.uploads[0]!.fail();
    else backend.uploads[0]!.finish(outcome);

    const failure = (await alert()).textContent;
    expect(failure).toContain(
      "Upload of chapter-1.mp3 for th failed (Media Asset 100)",
    );
    expect(failure).toContain(uncertain);
    expect(backend.completions()).toEqual([]);
    expect(button("Retry finalization")).toBeNull();
    expect(button("Start new upload")).not.toBeNull();

    // The object landed after all, so the check finalizes it.
    fireEvent.click(button("Check upload / Retry finalization")!);
    await within(uploadPanel()).findByText(completeMessage);
    expect(backend.completions()).toEqual([
      {
        method: "POST",
        path: "/api/admin/media/100/complete",
        token: validToken,
        body: { lessonId: 1, languageCode: "th" },
      },
    ]);
    expect(backend.intents()).toHaveLength(1);
    expect(backend.uploads).toHaveLength(1);
  },
);

test("when the check finds the upload incomplete, only Start new upload is offered, and it alone requests a new Upload Intent", async () => {
  const backend = await open(
    failFirst(
      isCompletion,
      problem(
        409,
        "upload_incomplete",
        "Uploaded object is not available yet.",
        "req-409-upload",
      ),
    ),
  );
  await startUpload(backend);
  backend.uploads[0]!.fail();
  fireEvent.click(
    await within(uploadPanel()).findByRole("button", {
      name: "Check upload / Retry finalization",
    }),
  );

  await waitFor(async () =>
    expect((await alert()).textContent).toContain(
      "Uploaded object is not available yet. Request ID: req-409-upload",
    ),
  );
  expect((await alert()).textContent).toContain(terminal);
  expect(button("Check upload / Retry finalization")).toBeNull();
  expect(button("Retry finalization")).toBeNull();
  expect(screen.queryByText(/Upload complete/)).toBeNull();
  expect(backend.intents()).toHaveLength(1);

  fireEvent.click(button("Start new upload")!);
  chooseFile(mp3File("retake.mp3"));
  fireEvent.click(uploadButton());
  await waitFor(() => expect(backend.uploads).toHaveLength(2));
  expect(backend.intents()).toHaveLength(2);
  backend.uploads[1]!.finish(200);
  await within(uploadPanel()).findByText(completeMessage);
  expect(backend.completions().map(({ path }) => path)).toEqual([
    "/api/admin/media/100/complete",
    "/api/admin/media/101/complete",
  ]);
});

test.each([
  [
    "the uploaded object is invalid",
    isCompletion,
    problem(
      422,
      "invalid_uploaded_media",
      "Uploaded object does not match its declared media metadata.",
      "req-422",
    ),
  ],
  [
    "the Media Asset has failed",
    isCompletion,
    problem(409, "media_asset_failed", "Media Asset has failed.", "req-409"),
  ],
  [
    "the Upload Intent is refused",
    (request: BffRequest) => request.path === intentPath,
    storageOutage(),
  ],
] as const)(
  "when %s, the panel explains a new upload is required and offers only Start new upload",
  async (_case, matches, response) => {
    const backend = await open(failFirst(matches, response));
    chooseFile(mp3File());
    fireEvent.click(uploadButton());
    if (matches === isCompletion) {
      await waitFor(() => expect(backend.uploads).toHaveLength(1));
      backend.uploads[0]!.finish(200);
    }

    const failure = (await alert()).textContent;
    expect(failure).toContain(response.body.detail);
    expect(failure).toContain(terminal);
    expect(
      within(uploadPanel())
        .getAllByRole("button")
        .filter((control) => !control.hasAttribute("disabled"))
        .map((control) => control.textContent),
    ).toEqual(["Start new upload"]);
    await settle();
    expect(backend.intents()).toHaveLength(1);
    expect(backend.completions()).toHaveLength(
      matches === isCompletion ? 1 : 0,
    );
  },
);

test("a 401 during finalization prompts for the token, keeps the recovery, and Retry finalization then completes", async () => {
  const backend = await open(
    failFirst(
      isCompletion,
      problem(
        401,
        "authentication_required",
        "Authentication is required.",
        "req-401",
      ),
    ),
  );
  await startUpload(backend);
  backend.uploads[0]!.finish(200);

  const dialog = await screen.findByRole("dialog", {
    name: "Re-enter admin token",
  });
  fireEvent.change(within(dialog).getByLabelText("Admin token"), {
    target: { value: validToken },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Connect" }));
  await waitFor(() => expect(dialog.isConnected).toBe(false));

  expect((await alert()).textContent).toContain(retryable);
  fireEvent.click(button("Retry finalization")!);
  await within(uploadPanel()).findByText(completeMessage);
  expect(backend.completions().map(({ path, token }) => [path, token])).toEqual(
    Array(2).fill(["/api/admin/media/100/complete", validToken]),
  );
  expect(backend.intents()).toHaveLength(1);
  expect(backend.uploads).toHaveLength(1);
});

test("Publish and Archive wait while finalizing, including a retry, and return once the attempt settles", async () => {
  // Cited, so the Draft is otherwise ready to publish.
  const backend = await open(failFirst(isCompletion, storageOutage()), {
    lessonSources: [
      { ...lawSource, pageFrom: null, pageTo: null, sectionReference: null },
    ],
  });
  const lifecycle = () =>
    ["Publish", "Archive"].map(
      (name) =>
        (
          within(screen.getByRole("region", { name: "Publication" })).getByRole(
            "button",
            { name },
          ) as HTMLButtonElement
        ).disabled,
    );
  expect(lifecycle()).toEqual([false, false]);

  await startUpload(backend);
  expect(lifecycle()).toEqual([true, true]);
  const releaseFirst = hold(backend.network, isCompletion);
  backend.uploads[0]!.finish(200);
  await within(uploadPanel()).findByText("Finalizing the upload…");
  expect(lifecycle()).toEqual([true, true]);
  releaseFirst();
  expect((await alert()).textContent).toContain(retryable);
  expect(lifecycle()).toEqual([false, false]);

  const releaseRetry = hold(backend.network, isCompletion);
  fireEvent.click(button("Retry finalization")!);
  await within(uploadPanel()).findByText("Finalizing the upload…");
  expect(lifecycle()).toEqual([true, true]);
  releaseRetry();
  await within(uploadPanel()).findByText(completeMessage);
  expect(lifecycle()).toEqual([false, false]);
});

test("leaving warns during an upload and while recovery is possible, and confirming discards the recovery", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const backend = await open();
  expect(unloadBlocked()).toBe(false);

  await startUpload(backend);
  expect(unloadBlocked()).toBe(true);
  backend.uploads[0]!.fail();
  expect((await alert()).textContent).toContain(uncertain);
  expect(unloadBlocked()).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  const back = screen.getByRole("button", { name: "Back to catalogue" });
  fireEvent.click(back);
  expect(confirm).toHaveBeenCalledTimes(2);
  for (const [message] of confirm.mock.calls)
    expect(message).toMatch(/recovery will be discarded/);
  expect(button("Check upload / Retry finalization")).not.toBeNull();

  confirm.mockReturnValue(true);
  fireEvent.click(back);
  await screen.findByRole("table");
  expect(unloadBlocked()).toBe(false);
  await openLesson(1, 1);
  expect(within(uploadPanel()).queryByRole("alert")).toBeNull();
  expect(backend.completions()).toEqual([]);
  expect(backend.intents()).toHaveLength(1);
});

test("a terminal failure leaves nothing to recover, so leaving needs no warning", async () => {
  const confirm = vi.spyOn(window, "confirm");
  const backend = await open(
    failFirst(
      isCompletion,
      problem(
        422,
        "invalid_uploaded_media",
        "Uploaded object does not match its declared media metadata.",
        "req-422",
      ),
    ),
  );
  await startUpload(backend);
  backend.uploads[0]!.finish(200);
  expect((await alert()).textContent).toContain(terminal);
  await waitFor(() => expect(unloadBlocked()).toBe(false));

  fireEvent.click(screen.getByRole("button", { name: "Back to catalogue" }));
  await screen.findByRole("table");
  expect(confirm).not.toHaveBeenCalled();
});

test("a transient failure while checking the upload keeps the check on offer", async () => {
  const backend = await open(failFirst(isCompletion, storageOutage()));
  await startUpload(backend);
  backend.uploads[0]!.fail();
  fireEvent.click(
    await within(uploadPanel()).findByRole("button", {
      name: "Check upload / Retry finalization",
    }),
  );

  await waitFor(() => expect(backend.completions()).toHaveLength(1));
  await waitFor(async () =>
    expect((await alert()).textContent).toContain("Storage is unavailable."),
  );
  expect((await alert()).textContent).toContain(uncertain);
  expect(button("Start new upload")).not.toBeNull();

  fireEvent.click(button("Check upload / Retry finalization")!);
  await within(uploadPanel()).findByText(completeMessage);
  expect(backend.completions().map(({ path }) => path)).toEqual(
    Array(2).fill("/api/admin/media/100/complete"),
  );
  expect(backend.intents()).toHaveLength(1);
});

test("Start new upload gives up on a recoverable failure: the recovery is discarded and only the new upload is finalized", async () => {
  const backend = await open(failFirst(isCompletion, storageOutage()));
  await startUpload(backend);
  backend.uploads[0]!.finish(200);
  expect((await alert()).textContent).toContain(retryable);
  expect(unloadBlocked()).toBe(true);

  fireEvent.click(button("Start new upload")!);
  expect(within(uploadPanel()).queryByRole("alert")).toBeNull();
  expect(unloadBlocked()).toBe(false);
  expect(backend.intents()).toHaveLength(1);

  chooseFile(mp3File("retake.mp3"));
  fireEvent.click(uploadButton());
  await waitFor(() => expect(backend.uploads).toHaveLength(2));
  backend.uploads[1]!.finish(200);
  await within(uploadPanel()).findByText(completeMessage);
  expect(backend.intents()).toHaveLength(2);
  expect(backend.completions().map(({ path }) => path)).toEqual([
    "/api/admin/media/100/complete",
    "/api/admin/media/101/complete",
  ]);
});

test("a 500 during completion stays recoverable and says the request needs investigating in the backend logs", async () => {
  const backend = await open(
    failFirst(
      isCompletion,
      problem(
        500,
        "internal_error",
        "The request could not be completed.",
        "req-500",
      ),
    ),
  );
  await startUpload(backend);
  backend.uploads[0]!.finish(200);

  const failure = (await alert()).textContent;
  expect(failure).toContain(
    "The request could not be completed. Request ID: req-500",
  );
  expect(failure).toContain(
    "The server failed unexpectedly. Look up the request ID in the backend logs.",
  );
  expect(failure).toContain(retryable);

  fireEvent.click(button("Retry finalization")!);
  await within(uploadPanel()).findByText(completeMessage);
  expect(backend.intents()).toHaveLength(1);
});
