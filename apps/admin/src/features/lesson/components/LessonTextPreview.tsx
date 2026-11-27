// A read-only view of a Lesson Text as the learner reads it, drawn from the package's tree with
// React elements, so pasted text can never become markup in the page. Beside it, Copy as plain
// text puts the content's narration script on the clipboard, for pasting into ElevenLabs.
import {
  type Inline,
  narrationScript,
  parse,
} from "@ez-dk-citizen/lesson-text";
import { useId, useState } from "react";

import type { TextClipboard } from "../../../shared/lib/clipboard";

export function LessonTextPreview({
  title,
  content,
  clipboard,
}: {
  title: string;
  content: string;
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
      await clipboard.writeText(narrationScript(content));
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
      {parse(content).map((block, index) => {
        const Element =
          block.type === "paragraph" ? "p" : block.level === 2 ? "h5" : "h6";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: rebuilt from the text on each change, holding no state
          <Element key={index}>
            <Inlines inlines={block.children} />
          </Element>
        );
      })}
    </section>
  );
}

function Inlines({ inlines }: { inlines: Inline[] }) {
  return inlines.map((inline, index) =>
    // biome-ignore lint/suspicious/noArrayIndexKey: rebuilt from the text on each change, holding no state
    inline.type === "break" ? <br key={index} /> : inline.value,
  );
}
