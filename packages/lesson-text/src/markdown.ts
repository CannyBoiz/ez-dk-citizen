// Lesson Text content as Markdown: the supported elements as a plain-data tree, which the Admin
// preview and the mobile app each draw with their own components. Any other element comes out
// as its plain text.
import MarkdownIt, { type Token } from "markdown-it";

export type Inline = { type: "text"; value: string } | { type: "break" };
export type Block =
  | { type: "heading"; level: 2 | 3; children: Inline[] }
  | { type: "paragraph"; children: Inline[] };

// Raw HTML is parsed as its own tokens so that it can be dropped, rather than shown as text.
// shortcut: an HTML block's text is dropped with its tags; #26 decides whether to keep it.
const markdown = new MarkdownIt({ html: true });

export function parse(content: string): Block[] {
  const tokens = markdown.parse(content, {});
  return tokens.flatMap((token, index): Block[] => {
    if (token.type === "fence" || token.type === "code_block")
      return [{ type: "paragraph", children: lines(token.content.trimEnd()) }];
    // Inline content outside a heading, such as a list item's or a table cell's, is a paragraph.
    if (token.type !== "inline") return [];
    const children = toInlines(token.children ?? []);
    // A bare `#` or an empty table cell would be a heading or paragraph with nothing to read.
    if (children.length === 0) return [];
    const opening = tokens[index - 1];
    if (opening.type !== "heading_open")
      return [{ type: "paragraph", children }];
    // The Title is the only level 1, so content headings are sections (2) and subsections (3).
    const level = Number(opening.tag.slice(1)) <= 2 ? 2 : 3;
    return [{ type: "heading", level, children }];
  });
}

// Keeps the text and line breaks, and drops the markup tokens around them.
function toInlines(tokens: Token[], inlines: Inline[] = []): Inline[] {
  for (const token of tokens) {
    // A single newline is a line break, as the admin typed it.
    if (token.type === "softbreak" || token.type === "hardbreak")
      inlines.push({ type: "break" });
    // An image's children are its alt text.
    else if (token.type === "image") toInlines(token.children ?? [], inlines);
    else if (token.type === "text" || token.type === "code_inline") {
      const last = inlines.at(-1);
      if (last?.type === "text") last.value += token.content;
      else inlines.push({ type: "text", value: token.content });
    }
  }
  return inlines;
}

function lines(text: string): Inline[] {
  return text
    .split("\n")
    .flatMap((line, index): Inline[] =>
      index === 0
        ? [{ type: "text", value: line }]
        : [{ type: "break" }, { type: "text", value: line }],
    );
}
