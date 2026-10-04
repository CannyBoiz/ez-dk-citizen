# 03: Browse and filter the Lesson catalogue

**What to build:** Once connected, the admin sees every Lesson from the existing unpaginated admin list, showing chapter, version, status, and available Languages. They can filter by chapter and by status, instantly in the browser, and open a Lesson into a read-only detail view that later tickets turn into the editor. The catalogue reflects the backend whenever the admin returns to it.

See the spec section "Admin application" (screens) and user stories 8–13.

**Blocked by:** 02 — Run the Admin and connect with the admin token

**Status:** resolved

- [x] The catalogue lists every Lesson with chapter, version, status, and available Languages
- [x] Filtering by chapter and by status happens client-side, and the two filters can be combined
- [x] An empty catalogue and an empty filter result show clear empty states
- [x] Opening a Lesson shows its structure, Lesson Texts, and Lesson Sources read from the BFF
- [x] Returning to the catalogue reloads it from the backend
- [x] A Data Service outage shows an error with request ID and allows a retry
- [x] Whole-app tests cover listing, both filters, opening a Lesson, and the error state
