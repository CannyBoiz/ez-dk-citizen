// A Source's publication date: its label, and the native date input value it converts to and from.

// The UTC calendar date as the admin reads it; null means the date is unknown.
export function publicationLabel(publishedAt: string | null) {
  return publishedAt === null
    ? "publication date unknown"
    : `published ${publicationDate(publishedAt)}`;
}

// The UTC calendar date as a native date input holds it: YYYY-MM-DD.
export function publicationDate(publishedAt: string) {
  return new Date(publishedAt).toISOString().slice(0, 10);
}

// A native date input's YYYY-MM-DD as the Source records it, midnight UTC; blank is unknown.
export function toPublishedAt(date: string | undefined) {
  return date ? `${date}T00:00:00.000Z` : null;
}
