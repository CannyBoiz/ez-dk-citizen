// Shared fixtures, a fake Network, and an in-memory BFF for the whole-app tests.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect } from "vitest";
import type {
  AdminLessonAudio,
  CompleteMediaAssetRequest,
  CreateUploadIntentRequest,
  LessonDetail,
  LessonStatus,
  LessonSummary,
  CreateSourceRequest,
  SourceResponse,
  UpsertLessonSourceRequest,
} from "@ez-dk-citizen/api-contracts/schemas";

import { hasLessonText } from "../../features/lesson/utils/lessonTexts";
import type { BffRequest, BffResponse, Network, ObjectUpload } from "../lib/network";

export const validToken = "correct-token";
export const lessons = { items: [] };

export function problem(status: number, code: string, detail: string, requestId: string) {
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
  respond: (request: BffRequest) => BffResponse = (request) =>
    request.token === validToken
      ? { status: 200, body: lessons }
      : problem(401, "authentication_required", "Authentication is required.", "req-401"),
) {
  const requests: BffRequest[] = [];
  const uploads: PendingUpload[] = [];
  const network: Network = {
    async bff(request) {
      requests.push(request);
      return respond(request);
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

// Holds matching BFF requests until the returned release is called.
export function holdRequests(network: Network, matches: (request: BffRequest) => boolean) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const bff = network.bff;
  network.bff = async (request) => {
    if (matches(request)) await held;
    return bff(request);
  };
  return release;
}

// Current Lesson Audio as the BFF stores it, keyed by `${lessonId}:${languageCode}`.
export type StoredAudio = Omit<AdminLessonAudio, "playbackUrl" | "playbackExpiresAt">;

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
  fireEvent.change(screen.getByLabelText("Admin token"), { target: { value: token } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
}


export function lessonSummary(id: number, overrides: Partial<LessonSummary> = {}): LessonSummary {
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

export const catalogue = [
  lessonSummary(1, { status: "PUBLISHED", availableLanguageCodes: ["da", "th"] }),
  lessonSummary(2, { chapter: 1, version: 2, availableLanguageCodes: ["th"] }),
  lessonSummary(3, { chapter: 2, version: 1 }),
  lessonSummary(4, { chapter: 2, version: 2, status: "ARCHIVED", availableLanguageCodes: ["en"] }),
];

export function rows() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").slice(0, 4).map((cell) => cell.textContent));
}

export function chapterVersions() {
  return rows().map(([chapter, version]) => `${chapter}.${version}`);
}


export function lessonDetail(id: number, overrides: Partial<LessonDetail> = {}): LessonDetail {
  return { ...lessonSummary(id), lessonTexts: [], lessonSources: [], ...overrides };
}

// An in-memory BFF for the editor tests; `override` injects failures, including 401s, per request.
// Sources already cited by `initial` Lessons join the canonical `sources`.
export function fakeBackend(
  initial: LessonDetail[] = [],
  {
    override = () => undefined,
    sources: extraSources = [],
    audio = {},
  }: {
    override?: (request: BffRequest) => BffResponse | undefined;
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
          lesson.lessonSources.map(({ id, url, publishedAt }) => ({ id, url, publishedAt })),
        ),
        ...extraSources,
      ].map((source) => [source.id, source]),
    ).values(),
  ];
  // The lifecycle rules of the Data Service, including the publication prerequisites.
  function transition(lesson: LessonDetail, status: LessonStatus): BffResponse {
    const allowed =
      lesson.status === "DRAFT" || (lesson.status === "PUBLISHED" && status === "ARCHIVED");
    if (!allowed)
      return problem(409, "lesson_lifecycle_conflict", "Lesson status transition is not allowed.", "req-409");
    if (status === "PUBLISHED") {
      const errors = [
        ...(hasLessonText(lesson, "th")
          ? []
          : [{ path: ["lessonTexts", "th"], message: "A Thai Lesson Text is required." }]),
        ...(lesson.lessonSources.length
          ? []
          : [{ path: ["lessonSources"], message: "At least one Lesson Source is required." }]),
      ];
      if (errors.length)
        return {
          status: 409,
          body: {
            ...problem(409, "lesson_publication_incomplete", "Lesson is missing publication prerequisites.", "req-409-incomplete").body,
            errors,
          },
        };
      if (lessons.some((other) => other.chapter === lesson.chapter && other.status === "PUBLISHED"))
        return problem(409, "published_lesson_conflict", "This chapter already has a Published Lesson.", "req-409-published");
    }
    lesson.status = status;
    return { status: 200, body: lesson };
  }

  const network = fakeNetwork((request) => {
    const overridden = override(request);
    if (overridden) return overridden;
    if (request.path === "/api/admin/sources") {
      if (request.method === "GET") return { status: 200, body: { items: sources } };
      const newSource = request.body as CreateSourceRequest;
      if (sources.some((source) => source.url === newSource.url))
        return problem(409, "source_url_conflict", "A Source with this URL already exists.", "req-409-source");
      const created = { id: Math.max(0, ...sources.map((source) => source.id)) + 1, ...newSource };
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
            "Content-Length": String((request.body as CreateUploadIntentRequest).sizeBytes),
            "If-None-Match": "*",
          },
          expiresAt: "2026-10-04T12:15:00.000Z",
        },
      };
    }
    if (request.path.startsWith("/api/admin/media/")) {
      const mediaAssetId = Number(request.path.split("/")[4]);
      const intent = intents.get(mediaAssetId)!;
      const { lessonId, languageCode } = request.body as CompleteMediaAssetRequest;
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
    // `/:id`, `/:id/texts/:languageCode`, `/:id/sources/:sourceId`, or `/:id/audio/:languageCode`.
    const [id, collection, member] = request.path.slice("/api/admin/lessons/".length).split("/");
    const body = request.body as { chapter: number; version: number; title: string; content: string };
    const conflict = (chapter: number, version: number, except?: number) =>
      lessons.some((other) => other.id !== except && other.chapter === chapter && other.version === version);
    const conflictProblem = problem(
      409,
      "lesson_version_conflict",
      "A Lesson with this chapter and version already exists.",
      "req-409",
    );

    if (!id) {
      if (request.method === "POST") {
        if (conflict(body.chapter, body.version)) return conflictProblem;
        const created = lessonDetail(Math.max(0, ...lessons.map((lesson) => lesson.id)) + 1, body);
        lessons.push(created);
        return { status: 201, body: created };
      }
      return {
        status: 200,
        body: { items: lessons.map(({ lessonTexts, lessonSources, ...summary }) => summary) },
      };
    }
    const lesson = lessons.find((candidate) => candidate.id === Number(id));
    if (!lesson) return problem(404, "lesson_not_found", "Lesson was not found.", "req-404");
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
    const status = (request.body as { status?: LessonStatus } | undefined)?.status;
    if (request.method === "PATCH" && status) return transition(lesson, status);
    if (lesson.status !== "DRAFT")
      return problem(409, "lesson_not_editable", "Only Draft Lessons can be edited.", "req-409");
    if (request.method === "PATCH") {
      if (conflict(body.chapter, body.version, lesson.id)) return conflictProblem;
      Object.assign(lesson, body);
    } else if (collection === "sources") {
      const source = sources.find((candidate) => candidate.id === Number(member));
      if (!source) return problem(404, "source_not_found", "Source was not found.", "req-404");
      const others = lesson.lessonSources.filter((cited) => cited.id !== source.id);
      if (request.method === "DELETE") {
        lesson.lessonSources = others;
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
    } else {
      lesson.lessonTexts = [
        ...lesson.lessonTexts.filter((text) => text.languageCode !== member),
        { languageCode: member!, title: body.title, content: body.content },
      ];
      lesson.availableLanguageCodes = lesson.lessonTexts.map((text) => text.languageCode).sort();
    }
    return { status: 200, body: lesson };
  });
  return { ...network, currentAudio };
}

// Opens a Lesson and waits for the editor's own first reads, so they never race a test's requests.
export async function openLesson(chapter: number, version: number) {
  fireEvent.click(await screen.findByRole("button", { name: `Open chapter ${chapter}, version ${version}` }));
  await screen.findByRole("heading", { name: `Chapter ${chapter}, version ${version}` });
  await waitFor(() => {
    expect(screen.queryByText("Loading audio…")).toBeNull();
    expect(screen.queryByText("Loading Sources…")).toBeNull();
  });
}

export function type(label: string, value: string, container: HTMLElement = document.body) {
  fireEvent.change(within(container).getByLabelText(label), { target: { value } });
}

export function structureForm() {
  return screen.getByRole("form", { name: "Structure" });
}


export function unloadBlocked() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}


export const thaiText = { languageCode: "th", title: "บทที่ 1", content: "เนื้อหาภาษาไทย" };

export function tab(languageCode: string) {
  return screen.getByRole("tab", { name: new RegExp(`^${languageCode}\\b`) });
}

export function textForm() {
  return screen.getByRole("form", { name: "Lesson Text" });
}


export function fieldError(label: string, container: HTMLElement) {
  const describedBy = within(container).getByLabelText(label).getAttribute("aria-describedby");
  return describedBy && document.getElementById(describedBy)?.textContent;
}


export const lawSource = {
  id: 1,
  url: "https://www.retsinformation.dk/eli/lta/2024/1",
  publishedAt: "2024-01-15T00:00:00.000Z",
};
export const guideSource = { id: 2, url: "https://nyidanmark.dk/da/guide", publishedAt: null };
// 01:00 at +02:00 is still 31 December in UTC.
export const bookSource = {
  id: 3,
  url: "https://uim.dk/Indfødsretsprøven.pdf",
  publishedAt: "2025-01-01T01:00:00+02:00",
};

export function finder() {
  return screen.getByRole("region", { name: "Source finder" });
}

// The visible text of each Source the finder lists.
export function sourceRows() {
  return within(within(finder()).getByRole("list", { name: "Sources" }))
    .queryAllByRole("listitem")
    .map((item) => item.textContent);
}

export function newSourceForm() {
  return within(finder()).getByRole("form", { name: "New Source" });
}

// Canonical Sources are found, created, and reused only.
export function canonicalEditControls() {
  return within(finder()).queryAllByRole("button", { name: /edit|delete|remove|update|rename/i });
}
