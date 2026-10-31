import type { ChangeKind, LessonStatus } from "@ez-dk-citizen/api-contracts";
import { and, desc, eq, inArray } from "drizzle-orm";

import type { DataTransaction } from "../../db/database.js";
import { lesson } from "../../db/schema.js";
import { fail, ok } from "../../outcome.js";

export function isAllowedLessonTransition(
  from: LessonStatus,
  to: LessonStatus,
) {
  return (
    (from === "DRAFT" && to === "PUBLISHED") ||
    (from === "PUBLISHED" && to === "ARCHIVED")
  );
}

export type LessonVersion = { version: number; versionPatch: number };

// The chapter's highest version, major first; only Published and Archived Lessons have one.
export async function selectHighestVersion(
  transaction: DataTransaction,
  chapter: number,
): Promise<LessonVersion | undefined> {
  const [highest] = await transaction
    .select({ version: lesson.version, versionPatch: lesson.versionPatch })
    .from(lesson)
    .where(
      and(
        eq(lesson.chapter, chapter),
        inArray(lesson.status, ["PUBLISHED", "ARCHIVED"]),
      ),
    )
    .orderBy(desc(lesson.version), desc(lesson.versionPatch))
    .limit(1);
  if (highest?.version == null || highest.versionPatch == null) return;
  return { version: highest.version, versionPatch: highest.versionPatch };
}

// The version a publication gives: 1.0 for the chapter's first, whatever the kind, and
// otherwise the chapter's highest version raised by the admin's chosen kind of change.
export function nextVersion(
  highest: LessonVersion | undefined,
  changeKind: ChangeKind | undefined,
) {
  if (!highest) return ok({ version: 1, versionPatch: 0 });
  if (changeKind === undefined) return fail("change_kind_required");
  return ok(
    changeKind === "content"
      ? { version: highest.version + 1, versionPatch: 0 }
      : { version: highest.version, versionPatch: highest.versionPatch + 1 },
  );
}

export function isEditableLesson(status: LessonStatus) {
  return status === "DRAFT";
}

export async function lockEditableDraft(
  transaction: DataTransaction,
  id: number,
) {
  const [existing] = await transaction
    .select({ status: lesson.status, updatedAt: lesson.updatedAt })
    .from(lesson)
    .where(eq(lesson.id, id))
    .for("update");
  if (!existing) return fail("lesson_not_found");
  if (!isEditableLesson(existing.status)) return fail("lesson_not_editable");
  return ok(existing);
}

export async function touchLesson(
  transaction: DataTransaction,
  id: number,
  updatedAt: Date,
) {
  await transaction
    .update(lesson)
    .set({ updatedAt: nextUpdatedAt(updatedAt) })
    .where(eq(lesson.id, id));
}

export function nextUpdatedAt(updatedAt: Date) {
  return new Date(Math.max(Date.now(), updatedAt.getTime() + 1));
}
