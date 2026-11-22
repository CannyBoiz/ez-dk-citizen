---
status: accepted
---

# Store Lesson Text content as Markdown, defined by one shared package

Lesson Text `content` is a Markdown string in the existing `text` column, so the
learner reads headings, lists and notes instead of a wall of text, and the admin
can paste the Markdown that drafting tools already produce. One shared
TypeScript package parses it and defines the supported set. The Admin preview
and the React Native app both render from that package, so the preview is what
the learner sees, and the Mobile API keeps returning a string. Markdown outside
the set is flattened to plain text by the renderer, not refused by the Backend.

## Consequences

- Changing the supported set changes how existing Lesson Texts render, in the
  preview and the app alike.
- The mobile app must be able to import the package. This is one reason the app
  stays React Native: Flutter was considered and rejected, because a Dart app
  could share neither this package nor `api-contracts`, leaving two Markdown
  parsers to keep aligned.

## Considered Options

- **Structured sections in the schema** (heading and body rows per Lesson
  Text): rejected. It needs new tables, a section editor, and more rows to copy
  for a new version, and pasted Markdown would still need converting into it.
- **Uploaded `.md` files kept in S3**: rejected. Content would leave
  PostgreSQL, so the non-blank check, the one-transaction Save and the
  new-version copy would no longer cover it, and the app would need a second
  fetch.
- **Backend validation of the supported set**: rejected while one trusted
  admin writes all content. It adds a Markdown parser to the Backend only to
  refuse the admin's own text. Revisit with more administrators.
