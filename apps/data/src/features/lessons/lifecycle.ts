import type { LessonStatus } from "@ez-dk-citizen/api-contracts";
import { eq } from "drizzle-orm";

import type { DataTransaction } from "../../db/database.js";
import { lesson } from "../../db/schema.js";

export function isAllowedLessonTransition(
  from: LessonStatus,
  to: LessonStatus,
) {
  return (
    (from === "DRAFT" && (to === "PUBLISHED" || to === "ARCHIVED")) ||
    (from === "PUBLISHED" && to === "ARCHIVED")
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
  if (!existing) return "lesson_not_found" as const;
  if (!isEditableLesson(existing.status)) return "lesson_not_editable" as const;
  return existing;
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
