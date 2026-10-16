# 01: Show every confirmation in the page

**What to build:** Every Admin confirmation moves out of the browser's `window.confirm` dialog into a small in-page confirmation that sits next to the action it guards and says what is at stake. This ticket converts the confirmations that exist today: archiving a Lesson, detaching a Source with unsaved references, leaving a Lesson or the Sources screen with unsaved forms (keeping the named-forms message from Stage 4 ticket 13), and leaving with recoverable upload state. Tickets 02–08 reuse the same confirmation for create, cancel, publish, replace, delete, and Source correction.

The before-unload warning for closing the tab or refreshing stays native, because a page cannot show its own dialog there.

See the spec sections "Admin" (Confirmations) and user stories 38–39.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Archiving, detaching with unsaved references, in-app navigation with unsaved forms, and navigation with recoverable upload state each show an in-page confirmation with the same wording as today
- [x] Choosing the cancel option in any confirmation makes no request and leaves the page and its unsaved edits as they were
- [x] The confirmation is reachable and operable by keyboard, and announced to assistive technology as a dialog or alert
- [x] The before-unload warning still fires for dirty forms and recoverable upload state
- [x] No `window.confirm` remains in the Admin
- [x] Whole-app tests drive each confirmation through visible controls, covering both confirming and cancelling
