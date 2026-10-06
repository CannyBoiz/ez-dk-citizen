// Whether the backend holds a Lesson Text in a Language, as the checklist and upload rules need.
import type { LessonDetail } from "@ez-dk-citizen/api-contracts/schemas";

export function hasLessonText(
  lesson: Pick<LessonDetail, "lessonTexts">,
  languageCode: string,
) {
  return lesson.lessonTexts.some((text) => text.languageCode === languageCode);
}
