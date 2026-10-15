# 05: One Save per Language tab

**What to build:** On a Draft, each Language tab has one Save that stores the chapter together with that Language's Lesson Text, all or nothing.

The Lesson command accepts `text: { languageCode, title, content }` and upserts that Language's Lesson Text in the same transaction as any `chapter` change. It is Draft only, so a non-Draft is `409 lesson_not_editable`. Blank fields are `422` with field errors and nothing is saved; an unsupported Language is `422 unsupported_language`. The separate Lesson Text `PUT` route stays for API clients, but the Admin stops using it.

In the Admin:

- The chapter field sits above the Language tabs, without its own Save, and shows its own Unsaved marker.
- Each tab's Save sends one Lesson command containing the dirty chapter (if any) and that tab's Lesson Text (if dirty and not entirely blank). A tab whose Language has no Lesson Text and blank fields saves only the chapter.
- A failed Save keeps both the chapter and the text edits.
- The leave warning names "Chapter" and each "Lesson Text (code)" separately.

Unchanged: Lesson Source references keep their own Save, the audio-mismatch warning still follows a text save, upload still requires the selected Language's Lesson Text to be saved, and Publish stays disabled while anything is unsaved.

See the spec sections "The Lesson command" and "Admin" (Editor), and user stories 1–5.

**Blocked by:** 02 — Give versions at publication

**Status:** resolved

- [x] One Lesson command with `chapter` and `text` saves both atomically; with a blank title or content it saves neither and returns field errors
- [x] `text` on a non-Draft is `409 lesson_not_editable`; an unsupported Language is `422 unsupported_language`
- [x] The Draft editor shows chapter above the tabs with no Save of its own and an Unsaved marker when changed
- [x] Changing the chapter on the `th` tab, switching to `da`, and clicking Save stores the chapter and the Danish text, while unsaved Thai edits stay unsaved
- [x] Saving a tab with no Lesson Text and blank fields stores only the chapter
- [x] A rejected Save keeps the chapter and text edits and shows the errors on their fields
- [x] The leave warning names "Chapter" and each dirty "Lesson Text (code)"
- [x] The audio-mismatch warning, the upload gate, Lesson Source reference saves, and disabled Publish while dirty behave as before
- [x] Contract, Data Service (real PostgreSQL), and whole-app tests cover the above
