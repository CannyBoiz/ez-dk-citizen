// A Source as the admin sees it: its URL as a link and its UTC publication date.
import { publicationLabel } from "../utils/publicationLabel";

export function SourceLabel({
  url,
  publishedAt,
}: {
  url: string;
  publishedAt: string | null;
}) {
  return (
    <>
      <a href={url} target="_blank" rel="noreferrer">
        {url}
      </a>
      {` · ${publicationLabel(publishedAt)}`}
    </>
  );
}
