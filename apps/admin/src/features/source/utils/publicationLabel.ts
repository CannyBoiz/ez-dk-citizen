// A Source's publication date as its UTC calendar date; null means the date is unknown.
export function publicationLabel(publishedAt: string | null) {
  return publishedAt === null
    ? "publication date unknown"
    : `published ${new Date(publishedAt).toISOString().slice(0, 10)}`;
}
