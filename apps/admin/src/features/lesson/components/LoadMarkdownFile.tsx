// Loads a drafted .md file into a Lesson Text's form, read in the browser and never uploaded: a
// leading `# heading` becomes the Title, so it is not repeated in the content. The tab's Save
// stores it, like typed text.
import { type Inline, parse } from "@ez-dk-citizen/lesson-text";
import { useState } from "react";

import type { Values } from "../../../shared/components/EditForm";

export function LoadMarkdownFile({
  value,
  onChange,
  readOnly,
}: {
  value: Values;
  onChange: (value: Values) => void;
  readOnly: boolean;
}) {
  const [failed, setFailed] = useState(false);

  async function load(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    setFailed(false);
    try {
      // Blob.text() decodes UTF-8, so Thai marks and Danish letters survive.
      onChange({ ...value, ...splitTitle(await file.text()) });
    } catch {
      // Such as a file moved or changed since it was chosen; choosing it again re-reads it.
      setFailed(true);
    } finally {
      // Cleared, so choosing the same file again, after editing or a failed read, reads it again.
      input.value = "";
    }
  }

  return (
    <>
      <label>
        Load .md file
        <input
          type="file"
          accept=".md"
          disabled={readOnly}
          onChange={(event) => load(event.currentTarget)}
        />
      </label>
      {failed && (
        <p role="alert">The file could not be read. Choose it again.</p>
      )}
    </>
  );
}

function splitTitle(markdown: string): Values {
  // A textarea holds LF line breaks, so a CRLF file would never match what it shows.
  const text = markdown.replace(/\r\n?/g, "\n");
  // The first non-blank line, and what follows it.
  const [, line = "", rest = ""] =
    /^(?:[ \t]*\n)*(.*)\n?([\s\S]*)$/.exec(text) ?? [];
  // Only a level-1 heading is the Title; the package's parse reports it as a section.
  // shortcut: the heading is parsed alone, so a reference link or footnote in it keeps its
  // brackets; parse it in context if Titles ever carry them.
  const [heading] = /^ {0,3}#(?!#)/.test(line) ? parse(line) : [];
  if (heading?.type !== "heading") return { content: text };
  return {
    title: plainText(heading.children),
    content: rest.replace(/^(?:[ \t]*\n)+/, ""),
  };
}

// The Title is plain text on one line, so its markup goes and a <br> becomes a space.
function plainText(inlines: Inline[]): string {
  return inlines
    .map((inline) =>
      inline.type === "text"
        ? inline.value
        : inline.type === "break"
          ? " "
          : plainText(inline.children),
    )
    .join("");
}
