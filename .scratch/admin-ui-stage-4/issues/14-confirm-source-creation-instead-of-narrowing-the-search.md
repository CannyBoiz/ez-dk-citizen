# 14: Confirm Source creation instead of narrowing the search

**What to build:** From the manual acceptance in ticket 11, creating a Source replaces the admin's search with the new Source's URL (`SourceFinder.tsx`), so the list silently narrows to one row. It reads as the form filling itself in, and the admin gets no clear signal that the create succeeded.

After a successful create, the search is left as the admin typed it. A status message says the Source was created and names its URL. If the new Source doesn't match the current search, the message says so, so the admin knows why it isn't in the list. A failed create keeps the New Source form's input and shows the error, as today. The `source_url_conflict` handling, which points at the existing Source, is unchanged.

See the spec section "Sources".

**Blocked by:** None

**Status:** resolved

- [x] Creating a Source keeps the current search and shows a success message naming the new Source's URL
- [x] The message says when the new Source is hidden by the current search
- [x] A failed create shows the error and keeps the form's input
- [x] A URL conflict still points at the existing Source
