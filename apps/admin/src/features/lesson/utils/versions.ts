// Lesson versions as the admin sees them. Publication gives a Lesson its `major.patch`
// version, so Published and Archived Lessons are named by it, and Drafts, which have none
// yet, by the day they were created.
import type {
  ChangeKind,
  LessonSummary,
} from "@ez-dk-citizen/api-contracts/schemas";

type Version = { version: number; versionPatch: number };

export const changeKindLabels: Record<ChangeKind, string> = {
  content: "Content change",
  fix: "Fix",
};

export function lessonVersion({
  version,
  versionPatch,
}: Pick<LessonSummary, "version" | "versionPatch">): Version | undefined {
  return version === null || versionPatch === null
    ? undefined
    : { version, versionPatch };
}

export function formatVersion({ version, versionPatch }: Version) {
  return `${version}.${versionPatch}`;
}

// The chapter's highest version, major first, which a later publication raises.
export function highestVersion(lessons: LessonSummary[], chapter: number) {
  return lessons
    .filter((lesson) => lesson.chapter === chapter)
    .map(lessonVersion)
    .filter((version) => version !== undefined)
    .sort((a, b) => b.version - a.version || b.versionPatch - a.versionPatch)
    .at(0);
}

// A content change raises major and resets patch (2.1 -> 3.0); a fix raises patch (2.1 -> 2.2).
export function raiseVersion(highest: Version, changeKind: ChangeKind) {
  return changeKind === "content"
    ? { version: highest.version + 1, versionPatch: 0 }
    : { version: highest.version, versionPatch: highest.versionPatch + 1 };
}

// "11 Oct 2026" in the admin's time zone, spelled the same whatever the browser's locale.
const dateFormat = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDate(timestamp: string) {
  const parts = Object.fromEntries(
    dateFormat
      .formatToParts(new Date(timestamp))
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.day} ${parts.month} ${parts.year}`;
}

// The catalogue's Version column: "2.1", or "Draft, created 11 Oct 2026".
export function versionLabel(lesson: LessonSummary) {
  const version = lessonVersion(lesson);
  return version
    ? formatVersion(version)
    : `Draft, created ${formatDate(lesson.createdAt)}`;
}

// "Chapter 3, version 2.1", or "Chapter 3 · Draft, created 11 Oct 2026".
export function lessonLabel(lesson: LessonSummary) {
  const separator = lessonVersion(lesson) ? ", version " : " · ";
  return `Chapter ${lesson.chapter}${separator}${versionLabel(lesson)}`;
}
