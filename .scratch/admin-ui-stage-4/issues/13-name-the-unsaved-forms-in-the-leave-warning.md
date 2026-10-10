# 13: Name the unsaved forms in the leave warning

**What to build:** From the manual acceptance in ticket 11, the in-app leave confirmation says "You have unsaved changes, which will be discarded." but not where they are. The admin has to hunt through the structure form, every Language tab, each Lesson Source, and the New Source form to find them.

The confirmation names each dirty form, for example "Unsaved changes in Structure, Lesson Text (th), and Lesson Source https://example.org will be discarded." LessonView and SourceFinder report which forms are dirty, not just whether any are. The existing upload warning is unchanged.

The browser's before-unload prompt cannot show custom text, so it stays generic.

See the spec section "Editing and dirty state".

**Blocked by:** None

**Status:** resolved

- [x] Leaving a Lesson with dirty forms names each one in the confirmation: Structure, each Lesson Text by Language, each Lesson Source by its Source URL, and New Source
- [x] Leaving the Sources screen with a dirty New Source form names it
- [x] A form that is saved again drops out of the message
- [x] The before-unload warning still fires for any dirty form
