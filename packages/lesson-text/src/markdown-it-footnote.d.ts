// The plugin ships no types, and @types/markdown-it-footnote is written against @types/markdown-it,
// which no longer matches the types markdown-it 15 ships.
declare module "markdown-it-footnote" {
  import type { MarkdownIt } from "markdown-it";

  export default function footnote(md: MarkdownIt): void;
}
