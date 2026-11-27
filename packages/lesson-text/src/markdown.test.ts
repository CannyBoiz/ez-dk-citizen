import assert from "node:assert/strict";
import { test } from "node:test";

import { narrationScript, parse } from "./markdown.ts";

const text = (value: string) => ({ type: "text", value }) as const;
const paragraph = (value: string) =>
  ({ type: "paragraph", children: [text(value)] }) as const;

test("bullet and numbered lists keep their nesting, and a numbered list keeps its first number", () => {
  assert.deepEqual(
    parse("- Pas\n  1. Gyldigt\n  2. Underskrevet\n- Gebyr\n\n3. Tre\n4. Fire"),
    [
      {
        type: "bulletList",
        items: [
          [
            paragraph("Pas"),
            {
              type: "numberedList",
              start: 1,
              items: [[paragraph("Gyldigt")], [paragraph("Underskrevet")]],
            },
          ],
          [paragraph("Gebyr")],
        ],
      },
      {
        type: "numberedList",
        start: 3,
        items: [[paragraph("Tre")], [paragraph("Fire")]],
      },
    ],
  );
});

test("a task item's checkbox is dropped, so a checklist is a plain list", () => {
  assert.deepEqual(
    parse(
      "- [ ] Pas\n- [x] Gebyr\n- [X] Foto\n  - [ ] Farve\n1. [ ] Ansøg\n- [ ]",
    ),
    [
      {
        type: "bulletList",
        items: [
          [paragraph("Pas")],
          [paragraph("Gebyr")],
          [
            paragraph("Foto"),
            { type: "bulletList", items: [[paragraph("Farve")]] },
          ],
        ],
      },
      { type: "numberedList", start: 1, items: [[paragraph("Ansøg")]] },
      { type: "bulletList", items: [[]] },
    ],
  );
});

test("bold, italic and strikethrough hold their text, and nest", () => {
  assert.deepEqual(
    parse("**Fed** og *kursiv* og _også_ og ~~streget~~\n__fed *og kursiv*__"),
    [
      {
        type: "paragraph",
        children: [
          { type: "bold", children: [text("Fed")] },
          text(" og "),
          { type: "italic", children: [text("kursiv")] },
          text(" og "),
          { type: "italic", children: [text("også")] },
          text(" og "),
          { type: "strikethrough", children: [text("streget")] },
          { type: "break" },
          {
            type: "bold",
            children: [
              text("fed "),
              { type: "italic", children: [text("og kursiv")] },
            ],
          },
        ],
      },
    ],
  );
});

test("---, like *** and ___, is a divider", () => {
  assert.deepEqual(parse("Før\n\n---\n\nMidt\n\n***\n___\nEfter"), [
    paragraph("Før"),
    { type: "divider" },
    paragraph("Midt"),
    { type: "divider" },
    { type: "divider" },
    paragraph("Efter"),
  ]);
});

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
    "See [a link](https://example.test) with `code` ![alt text](x.png)",
    "> quoted",
    "```\nline one\nline two\n```",
    "| a | b |\n| - | - |\n| 1 | 2 |",
  ].join("\n\n");

  assert.deepEqual(parse(content), [
    {
      type: "paragraph",
      children: [text("See a link with code alt text")],
    },
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

test("in the narration script, bullets drop, numbered items keep their numbers, struck-through text is left out, and a divider is a blank line", () => {
  assert.equal(
    narrationScript(
      "Medbring:\n\n- Pas\n- [x] **Foto**\n  1. Farve\n  2. *Ny* ~~sort-hvid~~\n\n---\n\n3. Ansøg\n4. Betal ~~500~~ 600 kr.\n\n~~Gammel regel~~\n\nSlut",
    ),
    "Medbring:\n\nPas\n\nFoto\n\n1. Farve\n\n2. Ny \n\n\n\n3. Ansøg\n\n4. Betal  600 kr.\n\nSlut",
  );
});

test("the narration script of plain text is that text", () => {
  const content = "ข้อแรก\nบรรทัดที่สอง\n\nข้อสอง";
  assert.equal(narrationScript(content), content);
});
