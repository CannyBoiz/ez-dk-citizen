import assert from "node:assert/strict";
import { test } from "node:test";

import { narrationScript, parse } from "./markdown.ts";

const text = (value: string) => ({ type: "text", value }) as const;

test("headings come out at level 2 or 3: # and ## are 2, ### and deeper are 3", () => {
  assert.deepEqual(parse("# One\n## Two\n### Three\n#### Four\n###### Six"), [
    { type: "heading", level: 2, children: [text("One")] },
    { type: "heading", level: 2, children: [text("Two")] },
    { type: "heading", level: 3, children: [text("Three")] },
    { type: "heading", level: 3, children: [text("Four")] },
    { type: "heading", level: 3, children: [text("Six")] },
  ]);
});

test("a blank line separates paragraphs, and a single newline is a line break", () => {
  assert.deepEqual(parse("ข้อแรก\nบรรทัดที่สอง\n\nข้อสอง"), [
    {
      type: "paragraph",
      children: [text("ข้อแรก"), { type: "break" }, text("บรรทัดที่สอง")],
    },
    { type: "paragraph", children: [text("ข้อสอง")] },
  ]);
});

test("an element not yet supported appears as its plain text, never as markup", () => {
  const content = [
    "**Bold** and [a link](https://example.test) with `code` ![alt text](x.png)",
    "- an item",
    "> quoted",
    "```\nline one\nline two\n```",
    "| a | b |\n| - | - |\n| 1 | 2 |",
  ].join("\n\n");

  assert.deepEqual(parse(content), [
    {
      type: "paragraph",
      children: [text("Bold and a link with code alt text")],
    },
    { type: "paragraph", children: [text("an item")] },
    { type: "paragraph", children: [text("quoted")] },
    {
      type: "paragraph",
      children: [text("line one"), { type: "break" }, text("line two")],
    },
    ...["a", "b", "1", "2"].map((cell) => ({
      type: "paragraph",
      children: [text(cell)],
    })),
  ]);
});

test("raw HTML is dropped as markup, keeping the text between inline tags", () => {
  assert.deepEqual(
    parse(
      'Say <b onclick="steal()">hello</b>\n\n<script>alert(1)</script>\n\nEnd',
    ),
    [
      { type: "paragraph", children: [text("Say hello")] },
      { type: "paragraph", children: [text("End")] },
    ],
  );
});

test("an empty heading or table cell leaves no block behind", () => {
  assert.deepEqual(parse("#\n\n| a |  |\n| - | - |"), [
    { type: "paragraph", children: [text("a")] },
  ]);
});

test("the narration script is the text the learner sees, with a blank line between blocks", () => {
  assert.equal(
    narrationScript(
      "# Rettigheder\nDu har **ret** til\nat stemme.\n\n\n#### Pligter\n\nSe [loven](https://example.test) <b>nu</b> ![et kort](kort.png)\n\n```\nlinje et\nlinje to\n```\n\n| a | b |\n| - | - |",
    ),
    "Rettigheder\n\nDu har ret til\nat stemme.\n\nPligter\n\nSe loven nu et kort\n\nlinje et\nlinje to\n\na\n\nb",
  );
});

test("the narration script of plain text is that text", () => {
  const content = "ข้อแรก\nบรรทัดที่สอง\n\nข้อสอง";
  assert.equal(narrationScript(content), content);
});
