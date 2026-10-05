// The Languages the Admin authors, in tab order; Thai, the learner's Language, is selected first.
export const languageCodes = ["da", "en", "th"] as const;
export type LanguageCode = (typeof languageCodes)[number];
