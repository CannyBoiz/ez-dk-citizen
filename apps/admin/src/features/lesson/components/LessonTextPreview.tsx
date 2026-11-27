// A read-only view of a Lesson Text as the learner reads it, drawn from the package's tree with
// React elements, so pasted text can never become markup in the page. Beside it, Copy as plain
// text puts the content's narration script on the clipboard, for pasting into ElevenLabs.
import {
  type Block,
  type Inline,
  type Language,
  type NoteKind,
  narrationScript,
  noteLabels,
  parse,
} from "@ez-dk-citizen/lesson-text";
import { useId, useState } from "react";

import type { TextClipboard } from "../../../shared/lib/clipboard";

export function LessonTextPreview({
  title,
  content,
  language,
  clipboard,
}: {
  title: string;
  content: string;
  language: Language;
  clipboard: TextClipboard;
}) {
  const labelId = useId();
  // A failure shows until the next copy, as the clipboard stays stale; a success shows only while
  // the content is still what was copied.
  const [lastCopy, setLastCopy] = useState<{
    content: string;
    failed: boolean;
  }>();

  async function copyScript() {
    // Cleared first, so a repeated copy is announced again.
    setLastCopy(undefined);
    try {
      await clipboard.writeText(narrationScript(content, language));
      setLastCopy({ content, failed: false });
    } catch {
      setLastCopy({ content, failed: true });
    }
  }

  return (
    <section className="preview" aria-labelledby={labelId}>
      <div className="preview-header">
        <span className="preview-label" id={labelId}>
          Preview
        </span>
        <button type="button" onClick={copyScript}>
          Copy as plain text
        </button>
      </div>
      {lastCopy?.failed ? (
        <p role="alert">
          Could not copy the narration script; the clipboard still holds what
          was there before.
        </p>
      ) : (
        lastCopy?.content === content && (
          <p role="status">Copied the narration script.</p>
        )
      )}
      {/* Headings sit below the page's "Lesson Texts" heading: the Title, then sections and subsections. */}
      {title.trim() && <h4>{title}</h4>}
      <Blocks blocks={parse(content)} labels={noteLabels[language]} />
    </section>
  );
}

const inlineTags = {
  bold: "strong",
  italic: "em",
  strikethrough: "del",
} as const;

function Blocks({
  blocks,
  labels,
}: {
  blocks: Block[];
  labels: Record<NoteKind, string>;
}) {
  return blocks.map((block, index) => {
    // biome-ignore-start lint/suspicious/noArrayIndexKey: rebuilt from the text on each change, holding no state
    if (block.type === "divider") return <hr key={index} />;
    if (block.type === "bulletList" || block.type === "numberedList") {
      const items = block.items.map((item, itemIndex) => (
        <li key={itemIndex}>
          <Blocks blocks={item} labels={labels} />
        </li>
      ));
      return block.type === "bulletList" ? (
        <ul key={index}>{items}</ul>
      ) : (
        <ol key={index} start={block.start}>
          {items}
        </ol>
      );
    }
    if (block.type === "note")
      return <Note key={index} note={block} labels={labels} />;
    const Element =
      block.type === "paragraph" ? "p" : block.level === 2 ? "h5" : "h6";
    return (
      <Element key={index}>
        <Inlines inlines={block.children} />
      </Element>
    );
    // biome-ignore-end lint/suspicious/noArrayIndexKey: rebuilt from the text on each change, holding no state
  });
}

// A note is named by its visible label, in the form's Language; a plain quote has none.
function Note({
  note,
  labels,
}: {
  note: Extract<Block, { type: "note" }>;
  labels: Record<NoteKind, string>;
}) {
  const labelId = useId();
  const label = note.kind && labels[note.kind];
  return (
    <div
      role="note"
      aria-labelledby={label ? labelId : undefined}
      data-kind={note.kind}
    >
      {label && (
        <div className="note-label" id={labelId}>
          {label}
        </div>
      )}
      <Blocks blocks={note.children} labels={labels} />
    </div>
  );
}

function Inlines({ inlines }: { inlines: Inline[] }) {
  return inlines.map((inline, index) => {
    // biome-ignore-start lint/suspicious/noArrayIndexKey: rebuilt from the text on each change, holding no state
    if (inline.type === "break") return <br key={index} />;
    if (inline.type === "text") return inline.value;
    const Element = inlineTags[inline.type];
    return (
      <Element key={index}>
        <Inlines inlines={inline.children} />
      </Element>
    );
    // biome-ignore-end lint/suspicious/noArrayIndexKey: rebuilt from the text on each change, holding no state
  });
}
