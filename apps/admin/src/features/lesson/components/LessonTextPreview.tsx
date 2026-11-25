// A read-only view of a Lesson Text as the learner reads it, drawn from the package's tree with
// React elements, so pasted text can never become markup in the page.
import { type Inline, parse } from "@ez-dk-citizen/lesson-text";
import { useId } from "react";

export function LessonTextPreview({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  const labelId = useId();
  return (
    <section className="preview" aria-labelledby={labelId}>
      <span className="preview-label" id={labelId}>
        Preview
      </span>
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
