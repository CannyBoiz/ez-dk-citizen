// English labels for Lesson statuses, shared by the catalogue and the Lesson editor.
import type { LessonStatus } from "@ez-dk-citizen/api-contracts/schemas";

export const statusLabels: Record<LessonStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};
