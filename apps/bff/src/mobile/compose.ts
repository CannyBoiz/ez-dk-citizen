import {
  mobileLessonListResponseSchema,
  type LessonDetail,
  type MobileLessonDetail,
  type MobileLessonListResponse,
  type PublishedLessonDetail,
} from "@ez-dk-citizen/api-contracts";

export function composeMobileLessonList(
  lessons: LessonDetail[],
  languageCode: string,
): MobileLessonListResponse {
  return mobileLessonListResponseSchema.parse({
    items: lessons.flatMap((lesson) => {
      const text = lesson.lessonTexts.find(
        (item) => item.languageCode === languageCode,
      );
      return text
        ? [
            {
              id: lesson.id,
              chapter: lesson.chapter,
              version: lesson.version,
              languageCode,
              title: text.title,
            },
          ]
        : [];
    }),
  });
}

export function composeMobileLessonDetail(
  lesson: PublishedLessonDetail,
  languageCode: string,
): Omit<MobileLessonDetail, "audio"> | undefined {
  const text = lesson.lessonTexts.find(
    (item) => item.languageCode === languageCode,
  );
  if (!text) return undefined;
  return {
    id: lesson.id,
    chapter: lesson.chapter,
    version: lesson.version,
    languageCode,
    title: text.title,
    content: text.content,
    availableLanguageCodes: lesson.availableLanguageCodes,
    lessonSources: lesson.lessonSources,
  };
}
