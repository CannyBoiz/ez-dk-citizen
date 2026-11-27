// Lesson Text content as Markdown: the supported elements as a plain-data tree, which the Admin
// preview and the mobile app each draw with their own components, and the narration script read
// from it. Any other element comes out as its plain text.
import MarkdownIt, { type Token } from "markdown-it";

// GitHub's alert kinds; a note of any other kind is unlabelled.
const noteKinds = ["note", "tip", "important", "warning", "caution"] as const;
export type NoteKind = (typeof noteKinds)[number];

// Each note kind's label in each Language, so a Thai lesson never shows an English one.
export const noteLabels = {
  da: {
    note: "Bemærk",
    tip: "Tip",
    important: "Vigtigt",
    warning: "Advarsel",
    caution: "Forsigtig",
  },
  en: {
    note: "Note",
    tip: "Tip",
    important: "Important",
    warning: "Warning",
    caution: "Caution",
  },
  th: {
    note: "หมายเหตุ",
    tip: "เคล็ดลับ",
    important: "สำคัญ",
    warning: "คำเตือน",
    caution: "ข้อควรระวัง",
  },
} as const satisfies Record<string, Record<NoteKind, string>>;
export type Language = keyof typeof noteLabels;

export type Inline =
  | { type: "text"; value: string }
  | { type: "break" }
  | { type: "bold" | "italic" | "strikethrough"; children: Inline[] };
export type Block =
  | { type: "heading"; level: 2 | 3; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  // Each item is the blocks inside it, so items can hold paragraphs and nested lists.
  | { type: "bulletList"; items: Block[][] }
  | { type: "numberedList"; start: number; items: Block[][] }
  | { type: "divider" }
  // A plain quote, or an alert of an unknown kind, is a note without one.
  | { type: "note"; kind?: NoteKind; children: Block[] };

// Raw HTML is parsed as its own tokens so that it can be dropped, rather than shown as text.
// shortcut: an HTML block's text is dropped with its tags; #26 decides whether to keep it.
const markdown = new MarkdownIt({ html: true });

export function parse(content: string): Block[] {
  return toBlocks(nest(markdown.parse(content, {})));
}

// The narration script: the text the learner sees, in reading order, with a blank line between
// blocks, so that ElevenLabs pauses between them. A labelled note reads as "label: text" in the
// Lesson Text's Language, so the listener hears that a tip or warning is coming.
export function narrationScript(content: string, language: Language): string {
  const blockTexts = (block: Block): string[] => {
    if (block.type === "divider") return [""];
    if (block.type === "bulletList")
      return block.items.flat().flatMap(blockTexts);
    if (block.type === "numberedList")
      return block.items.flatMap((item, index) =>
        prefixed(`${block.start + index}. `, item.flatMap(blockTexts)),
      );
    if (block.type === "note") {
      const texts = block.children.flatMap(blockTexts);
      return block.kind
        ? prefixed(`${noteLabels[language][block.kind]}: `, texts)
        : texts;
    }
    const text = inlineText(block.children);
    // A paragraph that is all struck through has nothing to read.
    return text.trim() ? [text] : [];
  };
  return parse(content).flatMap(blockTexts).join("\n\n");
}

// Leads the first text with a prefix, such as an item's number; with no text, there is nothing to
// announce.
function prefixed(prefix: string, [first, ...rest]: string[]) {
  return first === undefined ? [] : [prefix + first, ...rest];
}

// Struck-through text is left out, so the narration never states a crossed-out claim as fact.
function inlineText(inlines: Inline[]): string {
  return inlines
    .map((inline) => {
      if (inline.type === "break") return "\n";
      if (inline.type === "text") return inline.value;
      if (inline.type === "strikethrough") return "";
      return inlineText(inline.children);
    })
    .join("");
}

// markdown-it's tokens are flat, an opening and a closing token around their contents; as a tree,
// a list holds its items and an item its blocks.
type Node = { token: Token; children: Node[] };

function nest(tokens: Token[]) {
  const root: Node[] = [];
  const open = [root];
  for (const token of tokens) {
    if (token.nesting === -1) {
      open.pop();
      continue;
    }
    const node = { token, children: [] };
    open[open.length - 1].push(node);
    if (token.nesting === 1) open.push(node.children);
  }
  return root;
}

function toBlocks(nodes: Node[]): Block[] {
  return nodes.flatMap(({ token, children }): Block[] => {
    if (token.type === "fence" || token.type === "code_block")
      return [{ type: "paragraph", children: lines(token.content.trimEnd()) }];
    if (token.type === "hr") return [{ type: "divider" }];
    if (token.type === "blockquote_open") return [toNote(children)];
    if (token.type === "bullet_list_open")
      return [{ type: "bulletList", items: children.map(toItem) }];
    if (token.type === "ordered_list_open")
      return [
        {
          type: "numberedList",
          start: Number(token.attrGet("start") ?? 1),
          items: children.map(toItem),
        },
      ];
    if (token.type === "heading_open") {
      const inlines = inlinesOf(children[0].token);
      if (inlines.length === 0) return [];
      // The Title is the only level 1, so content headings are sections (2) and subsections (3).
      const level = Number(token.tag.slice(1)) <= 2 ? 2 : 3;
      return [{ type: "heading", level, children: inlines }];
    }
    // Inline content outside a heading, such as a paragraph's or a table cell's, is a paragraph.
    if (token.type === "inline") {
      const inlines = inlinesOf(token);
      // An empty table cell would be a paragraph with nothing to read.
      return inlines.length === 0
        ? []
        : [{ type: "paragraph", children: inlines }];
    }
    // Any other container, such as a table, gives up its markup and keeps its blocks.
    return toBlocks(children);
  });
}

function toItem(item: Node) {
  // A task item's `[ ]` or `[x]` is dropped, so a pasted checklist reads as a plain list. The
  // tokens are this parse's own, so editing the text in place is safe.
  const [first] = item.children;
  const text =
    first?.token.type === "paragraph_open"
      ? first.children[0].token.children?.[0]
      : undefined;
  if (text?.type === "text")
    text.content = text.content.replace(/^\[[ xX]\](?:\s+|$)/, "");
  return toBlocks(item.children);
}

// A GitHub alert is a quote whose first line is only its `[!KIND]` marker, in any case, with more
// after it. The source line is read, not the parsed text, so an escaped `\[!NOTE]` stays a quote.
// The marker and its line break are dropped in place, as a task item's checkbox is.
function toNote(quote: Node[]): Block {
  const [first] = quote;
  const inline =
    first?.token.type === "paragraph_open"
      ? first.children[0].token
      : undefined;
  const [line, ...rest] = inline?.content.split("\n") ?? [];
  const kind = noteKinds.find(
    (candidate) => line?.trimEnd().toLowerCase() === `[!${candidate}]`,
  );
  // A marker with nothing after it, or one that parsed as a link, is left visible as a quote.
  const hasBody = rest.length > 0 || quote.length > 1;
  if (!kind || !hasBody || inline?.children?.[0]?.type !== "text")
    return { type: "note", children: toBlocks(quote) };
  inline.children.splice(0, 2);
  return { type: "note", kind, children: toBlocks(quote) };
}

const emphasis: Partial<Record<string, "bold" | "italic" | "strikethrough">> = {
  strong_open: "bold",
  em_open: "italic",
  s_open: "strikethrough",
};

function inlinesOf(token: Token) {
  return toInlines(nest(token.children ?? []));
}

// Keeps the text, line breaks and emphasis, and drops the markup tokens around them.
function toInlines(nodes: Node[], inlines: Inline[] = []): Inline[] {
  for (const { token, children } of nodes) {
    const kind = emphasis[token.type];
    if (kind) inlines.push({ type: kind, children: toInlines(children) });
    // A single newline is a line break, as the admin typed it.
    else if (token.type === "softbreak" || token.type === "hardbreak")
      inlines.push({ type: "break" });
    // An image's children are its alt text.
    else if (token.type === "image")
      toInlines(nest(token.children ?? []), inlines);
    else if (token.type === "text" || token.type === "code_inline") {
      const last = inlines.at(-1);
      if (last?.type === "text") last.value += token.content;
      // An item that was only a task marker is left with no text at all.
      else if (token.content)
        inlines.push({ type: "text", value: token.content });
    }
    // Any other inline container, such as a link, gives up its markup and keeps its text.
    else toInlines(children, inlines);
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
