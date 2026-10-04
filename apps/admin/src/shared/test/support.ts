// Shared fixtures, a fake Network, and an in-memory BFF for the whole-app tests.
import { fireEvent, screen, within } from "@testing-library/react";
import type {
  LessonDetail,
  LessonSummary,
  CreateSourceRequest,
  SourceResponse,
  UpsertLessonSourceRequest,
} from "@ez-dk-citizen/api-contracts/schemas";

import type { BffRequest, BffResponse, Network } from "../lib/network";

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

export function fakeNetwork(
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
  }: {
    override?: (request: BffRequest) => BffResponse | undefined;
    sources?: SourceResponse[];
  } = {},
) {
  const lessons = structuredClone(initial);
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
  return fakeNetwork((request) => {
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
    // `/:id`, `/:id/texts/:languageCode`, or `/:id/sources/:sourceId`.
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
    if (request.method === "GET") return { status: 200, body: lesson };
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
}

export async function openLesson(chapter: number, version: number) {
  fireEvent.click(await screen.findByRole("button", { name: `Open chapter ${chapter}, version ${version}` }));
  await screen.findByRole("heading", { name: `Chapter ${chapter}, version ${version}` });
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
