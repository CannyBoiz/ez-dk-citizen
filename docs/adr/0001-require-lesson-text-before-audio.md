# Require localized Lesson Text before Lesson Audio

Lesson Audio uses a composite foreign key from `(lesson_id, language_code)` to
Lesson Text. This prevents audio from existing in a Language for which the
Lesson has no localized text, matching the PoC creation flow at the cost of
requiring text to be persisted before its audio rendition.
