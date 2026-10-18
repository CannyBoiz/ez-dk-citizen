// Shared fixtures, a fake Network, and an in-memory Backend for the whole-app tests.

import type {
  AdminLessonAudio,
  ChangeKind,
  CompleteMediaAssetRequest,
  CreateSourceRequest,
  CreateUploadIntentRequest,
  LessonDetail,
  LessonStatus,
  LessonSummary,
  PatchLessonRequest,
  SourceResponse,
  UpdateSourceRequest,
  UpsertLessonSourceRequest,
} from "@ez-dk-citizen/api-contracts/schemas";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect } from "vitest";

import type {
  BackendRequest,
  BackendResponse,
  Network,
  ObjectUpload,
} from "../lib/network";

export const validToken = "correct-token";
export const lessons = { items: [] };

export function problem(
  status: number,
  code: string,
  detail: string,
  requestId: string,
) {
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

// A storage PUT the test settles by hand: report progress, then finish or fail it.
export type PendingUpload = ObjectUpload & {
  finish(status?: number): void;
  fail(): void;
};

export function fakeNetwork(
  respond: (request: BackendRequest) => BackendResponse = (request) =>
    request.token === validToken
      ? { status: 200, body: lessons }
      : problem(
          401,
          "authentication_required",
          "Authentication is required.",
          "req-401",
        ),
) {
  const requests: BackendRequest[] = [];
  const uploads: PendingUpload[] = [];
  const network: Network = {
    async backend(request) {
      requests.push(request);
      // A snapshot, as over a real network: later backend changes never reach a sent response.
      return structuredClone(respond(request));
    },
    putObject(upload) {
      return new Promise((resolve, reject) =>
        uploads.push({
          ...upload,
          finish: (status = 200) => resolve({ status }),
          fail: () => reject(new Error("Network error")),
        }),
      );
    },
  };
  return { network, requests, uploads };
}

// Holds matching Backend calls until the returned release is called: before they reach the Backend
// ("request"), or after the Backend has handled them, delaying only the response ("response").
export function hold(
  network: Network,
  matches: (request: BackendRequest) => boolean,
  at: "request" | "response" = "request",
) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const backend = network.backend;
  network.backend = async (request) => {
    if (at === "request" && matches(request)) await held;
    const response = await backend(request);
    if (at === "response" && matches(request)) await held;
    return response;
  };
  return release;
}

// Matches only the first request that `matches` would, so later ones pass straight through.
export function firstOnly(matches: (request: BackendRequest) => boolean) {
  let matched = false;
  return (request: BackendRequest) => {
    if (matched || !matches(request)) return false;
    matched = true;
    return true;
  };
}

// Lets pending responses and the updates they cause finish, before asserting that something
// did not happen.
export function settle() {
  return act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
}

export function storageOutage(requestId = "req-503") {
  return problem(
    503,
    "storage_unavailable",
    "Storage is unavailable.",
    requestId,
  );
}

// Current Lesson Audio as the Backend stores it, keyed by `${lessonId}:${languageCode}`.
export type StoredAudio = Omit<
  AdminLessonAudio,
  "playbackUrl" | "playbackExpiresAt"
>;

export function storedAudio(overrides: Partial<StoredAudio> = {}): StoredAudio {
  return {
    mediaAssetId: 41,
    audioVersion: 1,
    originalFilename: "chapter-1-th.mp3",
    contentType: "audio/mpeg",
    sizeBytes: 3 * 1024 * 1024,
    durationMs: null,
    ...overrides,
  };
}

export async function connect(token: string) {
  fireEvent.change(screen.getByLabelText("Admin token"), {
    target: { value: token },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
}

// Created at noon UTC, so it reads as 11 Oct 2026 in any test machine's time zone.
export const createdAt = "2026-10-11T12:00:00.000Z";

// Published and Archived Lessons default to version 1.0; Drafts have none.
export function lessonSummary(
  id: number,
  overrides: Partial<LessonSummary> = {},
): LessonSummary {
  const versioned = (overrides.status ?? "DRAFT") !== "DRAFT";
  return {
    id,
    chapter: id,
    version: versioned ? 1 : null,
    versionPatch: versioned ? 0 : null,
    status: "DRAFT",
    createdAt,
    updatedAt: createdAt,
    availableLanguageCodes: [],
    ...overrides,
  };
}

export const catalogue = [
  lessonSummary(1, {
    status: "PUBLISHED",
    availableLanguageCodes: ["da", "th"],
  }),
  lessonSummary(2, { chapter: 1, availableLanguageCodes: ["th"] }),
  lessonSummary(3, { chapter: 2, createdAt: "2026-10-09T12:00:00.000Z" }),
  lessonSummary(4, {
    chapter: 2,
    version: 2,
    versionPatch: 1,
    status: "ARCHIVED",
    availableLanguageCodes: ["en"],
  }),
];

export function rows() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .slice(0, 4)
        .map((cell) => cell.textContent),
    );
}

export function chapterStatuses() {
  return rows().map(([chapter, , status]) => `${chapter} ${status}`);
}

export function lessonDetail(
  id: number,
  overrides: Partial<LessonDetail> = {},
): LessonDetail {
  return {
    ...lessonSummary(id, overrides),
    lessonTexts: [],
    lessonSources: [],
    ...overrides,
  };
}

// An in-memory Backend for the editor tests; `override` injects failures, including 401s, per request.
// Sources already cited by `initial` Lessons join the canonical `sources`.
export function fakeBackend(
  initial: LessonDetail[] = [],
  {
    override = () => undefined,
    sources: extraSources = [],
    audio = {},
  }: {
    override?: (request: BackendRequest) => BackendResponse | undefined;
    sources?: SourceResponse[];
    audio?: Record<string, StoredAudio>;
  } = {},
) {
  const lessons = structuredClone(initial);
  const currentAudio = structuredClone(audio);
  const intents = new Map<number, CreateUploadIntentRequest>();
  let playbacks = 0;
  const sources = [
    ...new Map(
      [
        ...lessons.flatMap((lesson) =>
          lesson.lessonSources.map(({ id, url, publishedAt }) => ({
            id,
            url,
            publishedAt,
          })),
        ),
        ...structuredClone(extraSources),
      ].map((source) => [source.id, source]),
    ).values(),
  ];
  // Every accepted transition succeeds; tests inject the backend's refusals through `override`.
  // Publication gives the version as the data module does: 1.0 for the chapter's first, and
  // otherwise the highest Published or Archived version raised by the change kind.
  function transition(
    lesson: LessonDetail,
    status: LessonStatus,
    changeKind?: ChangeKind,
  ): BackendResponse {
    if (status === "PUBLISHED") {
      const [highest] = lessons
        .filter(
          (other) => other.chapter === lesson.chapter && other.version !== null,
        )
        .sort(
          (a, b) =>
            b.version! - a.version! || b.versionPatch! - a.versionPatch!,
        );
      if (highest && !changeKind)
        return {
          status: 422,
          body: {
            ...problem(
              422,
              "validation_failed",
              "A change kind is required to publish this Lesson.",
              "req-422-change-kind",
            ).body,
            errors: [
              {
                path: ["changeKind"],
                message:
                  "Choose a content change or a fix: this chapter already has a version.",
              },
            ],
          },
        };
      Object.assign(
        lesson,
        !highest
          ? { version: 1, versionPatch: 0 }
          : changeKind === "content"
            ? { version: highest.version! + 1, versionPatch: 0 }
            : {
                version: highest.version,
                versionPatch: highest.versionPatch! + 1,
              },
      );
    }
    lesson.status = status;
    touch(lesson);
    return { status: 200, body: lesson };
  }

  const network = fakeNetwork((request) => {
    const overridden = override(request);
    if (overridden) return overridden;
    if (request.path.startsWith("/api/admin/sources/")) {
      const id = Number(request.path.split("/")[4]);
      const source = sources.find((candidate) => candidate.id === id);
      if (!source)
        return problem(
          404,
          "source_not_found",
          "Source was not found.",
          "req-404-source",
        );
      const correction = request.body as UpdateSourceRequest;
      if (
        sources.some((other) => other.id !== id && other.url === correction.url)
      )
        return problem(
          409,
          "source_url_conflict",
          "A Source with this URL already exists.",
          "req-409-source",
        );
      // Every citing Lesson shows the correction, and none of them is touched.
      for (const updated of [
        source,
        ...lessons.flatMap((lesson) =>
          lesson.lessonSources.filter((cited) => cited.id === id),
        ),
      ])
        Object.assign(updated, correction);
      return { status: 200, body: source };
    }
    if (request.path === "/api/admin/sources") {
      if (request.method === "GET")
        return { status: 200, body: { items: sources } };
      const newSource = request.body as CreateSourceRequest;
      if (sources.some((source) => source.url === newSource.url))
        return problem(
          409,
          "source_url_conflict",
          "A Source with this URL already exists.",
          "req-409-source",
        );
      const created = {
        id: Math.max(0, ...sources.map((source) => source.id)) + 1,
        ...newSource,
      };
      sources.push(created);
      return { status: 201, body: created };
    }
    if (request.path === "/api/admin/media/upload-intents") {
      const mediaAssetId = 100 + intents.size;
      intents.set(mediaAssetId, request.body as CreateUploadIntentRequest);
      return {
        status: 201,
        body: {
          mediaAssetId,
          uploadUrl: `https://s3.invalid/audio/${mediaAssetId}.mp3?signature=upload`,
          uploadHeaders: {
            "Content-Type": "audio/mpeg",
            "Content-Length": String(
              (request.body as CreateUploadIntentRequest).sizeBytes,
            ),
            "If-None-Match": "*",
          },
          expiresAt: "2026-10-04T12:15:00.000Z",
        },
      };
    }
    if (request.path.startsWith("/api/admin/media/")) {
      const mediaAssetId = Number(request.path.split("/")[4]);
      const intent = intents.get(mediaAssetId)!;
      const { lessonId, languageCode } =
        request.body as CompleteMediaAssetRequest;
      const key = `${lessonId}:${languageCode}`;
      const audioVersion = (currentAudio[key]?.audioVersion ?? 0) + 1;
      currentAudio[key] = storedAudio({
        mediaAssetId,
        audioVersion,
        originalFilename: intent.originalFilename,
        sizeBytes: intent.sizeBytes,
      });
      return {
        status: 200,
        body: {
          mediaAsset: {
            id: mediaAssetId,
            status: "READY",
            contentType: "audio/mpeg",
            sizeBytes: intent.sizeBytes,
            durationMs: null,
            uploadedAt: "2026-10-04T12:01:00.000Z",
          },
          lessonAudio: {
            id: mediaAssetId,
            lessonId,
            languageCode,
            audioVersion,
            isCurrent: true,
            createdAt: "2026-10-04T12:01:00.000Z",
          },
        },
      };
    }
    // `/:id`, `/:id/sources/:sourceId`, or `/:id/audio/:languageCode`.
    const [id, collection, member] = request.path
      .slice("/api/admin/lessons/".length)
      .split("/");

    if (!id) {
      if (request.method === "POST") {
        const created = lessonDetail(
          Math.max(0, ...lessons.map((lesson) => lesson.id)) + 1,
          { chapter: (request.body as { chapter: number }).chapter },
        );
        lessons.push(created);
        return { status: 201, body: created };
      }
      return {
        status: 200,
        body: {
          items: lessons.map(
            ({ lessonTexts, lessonSources, ...summary }) => summary,
          ),
        },
      };
    }
    const lesson = lessons.find((candidate) => candidate.id === Number(id));
    if (!lesson)
      return problem(
        404,
        "lesson_not_found",
        "Lesson was not found.",
        "req-404",
      );
    if (collection === "audio") {
      const stored = currentAudio[`${lesson.id}:${member}`];
      playbacks += 1;
      return {
        status: 200,
        body: {
          audio: stored
            ? {
                ...stored,
                playbackUrl: `https://s3.invalid/audio/${stored.mediaAssetId}.mp3?playback=${playbacks}`,
                playbackExpiresAt: "2026-10-04T13:00:00.000Z",
              }
            : null,
        },
      };
    }
    if (request.method === "GET") return { status: 200, body: lesson };
    const { status, changeKind } =
      (request.body as PatchLessonRequest | undefined) ?? {};
    if (request.method === "PATCH" && status)
      return transition(lesson, status, changeKind);
    if (lesson.status !== "DRAFT")
      return problem(
        409,
        "lesson_not_editable",
        "Only Draft Lessons can be edited.",
        "req-409",
      );
    if (request.method === "DELETE" && !collection) {
      lessons.splice(lessons.indexOf(lesson), 1);
      return { status: 204, body: null };
    }
    if (request.method === "PATCH") {
      const { chapter, text } = request.body as PatchLessonRequest;
      if (chapter !== undefined) lesson.chapter = chapter;
      if (text) {
        lesson.lessonTexts = [
          ...lesson.lessonTexts.filter(
            (saved) => saved.languageCode !== text.languageCode,
          ),
          text,
        ];
        lesson.availableLanguageCodes = lesson.lessonTexts
          .map((saved) => saved.languageCode)
          .sort();
      }
    } else {
      const source = sources.find(
        (candidate) => candidate.id === Number(member),
      );
      if (!source)
        return problem(
          404,
          "source_not_found",
          "Source was not found.",
          "req-404",
        );
      const others = lesson.lessonSources.filter(
        (cited) => cited.id !== source.id,
      );
      if (request.method === "DELETE") {
        lesson.lessonSources = others;
        touch(lesson);
        return { status: 204, body: null };
      }
      const references = request.body as UpsertLessonSourceRequest;
      lesson.lessonSources = [
        ...others,
        {
          ...source,
          pageFrom: references.pageFrom ?? null,
          pageTo: references.pageTo ?? null,
          sectionReference: references.sectionReference ?? null,
        },
      ].sort((a, b) => a.id - b.id);
    }
    touch(lesson);
    return { status: 200, body: lesson };
  });
  return { ...network, currentAudio };
}

// Like the data module, every change moves a Lesson's updatedAt strictly forward.
function touch(lesson: LessonDetail) {
  lesson.updatedAt = new Date(
    Math.max(Date.now(), Date.parse(lesson.updatedAt) + 1),
  ).toISOString();
}

// Opens a Lesson by its heading, such as "Chapter 1, version 2.1", or the only Lesson of a
// chapter by its number, and waits for the editor's own first reads, so they never race a
// test's requests. The editor's heading must match what the catalogue called the Lesson.
export async function openLesson(lesson: string | number = 1) {
  const open = await screen.findByRole("button", {
    name:
      typeof lesson === "number"
        ? new RegExp(`^Open Chapter ${lesson}\\b`)
        : `Open ${lesson}`,
  });
  fireEvent.click(open);
  await screen.findByRole("heading", {
    name: open.getAttribute("aria-label")!.slice("Open ".length),
  });
  await waitFor(() => {
    expect(screen.queryByText("Loading audio…")).toBeNull();
    expect(screen.queryByText("Loading Sources…")).toBeNull();
  });
}

export function type(
  label: string,
  value: string,
  container: HTMLElement = document.body,
) {
  fireEvent.change(within(container).getByLabelText(label), {
    target: { value },
  });
}

// The Draft's chapter, above the Language tabs, saved by whichever tab's Save is clicked.
export function chapterForm() {
  return screen.getByRole("form", { name: "Chapter" });
}

// The one in-page confirmation open in `container`, answered through its visible buttons.
export function confirmation(container: HTMLElement = document.body) {
  return within(container).getByRole("alertdialog");
}

export function answer(choice: string, container: HTMLElement = document.body) {
  fireEvent.click(
    within(confirmation(container)).getByRole("button", { name: choice }),
  );
}

export function unloadBlocked() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

export const thaiText = {
  languageCode: "th",
  title: "บทที่ 1",
  content: "เนื้อหาภาษาไทย",
};
export const danishText = {
  languageCode: "da",
  title: "Kapitel 1",
  content: "Indhold",
};

export function tab(languageCode: string) {
  return screen.getByRole("tab", { name: new RegExp(`^${languageCode}\\b`) });
}

export function textForm() {
  return screen.getByRole("form", { name: "Lesson Text" });
}

export function fieldError(label: string, container: HTMLElement) {
  const describedBy = within(container)
    .getByLabelText(label)
    .getAttribute("aria-describedby");
  return describedBy && document.getElementById(describedBy)?.textContent;
}

export const lawSource = {
  id: 1,
  url: "https://www.retsinformation.dk/eli/lta/2024/1",
  publishedAt: "2024-01-15T00:00:00.000Z",
};
export const guideSource = {
  id: 2,
  url: "https://nyidanmark.dk/da/guide",
  publishedAt: null,
};
// Where a correction moves lawSource.
export const movedLawUrl = "https://www.retsinformation.dk/eli/lta/2024/2";
// 01:00 at +02:00 is still 31 December in UTC.
export const bookSource = {
  id: 3,
  url: "https://uim.dk/Indfødsretsprøven.pdf",
  publishedAt: "2025-01-01T01:00:00+02:00",
};

// A Source as a Lesson Source, with no references unless overridden.
export const cited = (source: SourceResponse, overrides = {}) => ({
  ...source,
  pageFrom: null,
  pageTo: null,
  sectionReference: null,
  ...overrides,
});

export function finder() {
  return screen.getByRole("region", { name: "Source finder" });
}

// The visible text of each Source the finder lists, without its buttons and Edit form.
export function sourceRows() {
  return within(within(finder()).getByRole("list", { name: "Sources" }))
    .queryAllByRole("listitem")
    .map((item) => {
      const label = item.cloneNode(true) as HTMLElement;
      for (const control of label.querySelectorAll("button, form"))
        control.remove();
      return label.textContent!.trim();
    });
}

export function sourceEditForm(url: string) {
  return within(finder()).getByRole("form", { name: `Source ${url}` });
}

// Opens a listed Source's Edit form.
export function editSource(url: string) {
  fireEvent.click(
    within(finder()).getByRole("button", { name: `Edit ${url}` }),
  );
  return sourceEditForm(url);
}

// Saves an Edit form, which first asks in the page.
export function saveSource(form: HTMLElement) {
  fireEvent.click(within(form).getByRole("button", { name: "Save" }));
}

export function newSourceForm() {
  return within(finder()).getByRole("form", { name: "New Source" });
}

// Canonical Sources are found, created, corrected, and reused, but never deleted.
export function sourceDeleteControls() {
  return within(finder()).queryAllByRole("button", {
    name: /delete|remove/i,
  });
}

// A chosen file whose size is set without allocating it.
export function mp3File(name = "chapter-1.mp3", size = 2048, type = "") {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

export function uploadPanel() {
  return screen.getByRole("region", { name: "Upload audio" });
}

export function fileInput() {
  return within(uploadPanel()).getByLabelText("MP3 file") as HTMLInputElement;
}

export function uploadButton() {
  return within(uploadPanel()).getByRole("button", { name: "Upload" });
}

export function chooseFile(file: File) {
  fireEvent.change(fileInput(), { target: { files: [file] } });
}
