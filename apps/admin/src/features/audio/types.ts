// The Lesson and Language that current audio is read for and an upload targets.
import type { LanguageCode } from "../../shared/lib/languages";

export type AudioTarget = { lessonId: number; languageCode: LanguageCode };
