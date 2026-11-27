import assert from "node:assert/strict";
import { test } from "node:test";

import { narrationScript, noteLabels, parse } from "./markdown.ts";

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

test("--- straight under a line makes that line a section heading, as in standard Markdown", () => {
  assert.deepEqual(parse("Rettigheder\n---\nDu har ret til at stemme."), [
    { type: "heading", level: 2, children: [text("Rettigheder")] },
    paragraph("Du har ret til at stemme."),
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

test("each GitHub alert kind is a note of that kind, holding the blocks after its marker", () => {
  assert.deepEqual(
    parse(
      [
        "> [!NOTE]\n> Medbring pas.",
        "> [!TIP]\n> Læs højt.\n>\n> - Hver dag",
        "> [!IMPORTANT]\n> Mød op.",
        "> [!WARNING]\n> For sent.",
        "> [!caution]\n> Gebyr.",
      ].join("\n\n"),
    ),
    [
      { type: "note", kind: "note", children: [paragraph("Medbring pas.")] },
      {
        type: "note",
        kind: "tip",
        children: [
          paragraph("Læs højt."),
          { type: "bulletList", items: [[paragraph("Hver dag")]] },
        ],
      },
      { type: "note", kind: "important", children: [paragraph("Mød op.")] },
      { type: "note", kind: "warning", children: [paragraph("For sent.")] },
      { type: "note", kind: "caution", children: [paragraph("Gebyr.")] },
    ],
  );
});

test("a plain quote is an unlabelled note, and nests", () => {
  assert.deepEqual(parse("> Citat\n>\n> > Indre"), [
    {
      type: "note",
      children: [
        paragraph("Citat"),
        { type: "note", children: [paragraph("Indre")] },
      ],
    },
  ]);
});

// Drafting tools such as Obsidian put a title there; it is kept as the note's first line.
test("text after the marker on its line starts the note", () => {
  assert.deepEqual(
    parse(
      "> [!TIP] Læs højt hver dag.\n\n> [!tip] Husk dit pas\n> Tag det med.\n\n> [!NOTE] **Fed**",
    ),
    [
      {
        type: "note",
        kind: "tip",
        children: [paragraph("Læs højt hver dag.")],
      },
      {
        type: "note",
        kind: "tip",
        children: [
          {
            type: "paragraph",
            children: [
              text("Husk dit pas"),
              { type: "break" },
              text("Tag det med."),
            ],
          },
        ],
      },
      {
        type: "note",
        kind: "note",
        children: [
          {
            type: "paragraph",
            children: [{ type: "bold", children: [text("Fed")] }],
          },
        ],
      },
    ],
  );
});

// The marker stays visible, so the preview shows the mistake; escaping it is how to write it as text.
test("a note of an unknown kind, with nothing after its marker, or with its marker escaped, is unlabelled and keeps its marker", () => {
  assert.deepEqual(parse("> [!EXAM]\n> Husk\n\n> [!WARNING]\n\n> \\[!NOTE]"), [
    {
      type: "note",
      children: [
        {
          type: "paragraph",
          children: [text("[!EXAM]"), { type: "break" }, text("Husk")],
        },
      ],
    },
    { type: "note", children: [paragraph("[!WARNING]")] },
    { type: "note", children: [paragraph("[!NOTE]")] },
  ]);
});

test("an element not yet supported appears as its plain text, never as markup", () => {
  const content = [
    "See [a link](https://example.test) with `code` ![alt text](x.png)",
    "```\nline one\nline two\n```",
    "| a | b |\n| - | - |\n| 1 | 2 |",
  ].join("\n\n");

  assert.deepEqual(parse(content), [
    {
      type: "paragraph",
      children: [text("See a link with code alt text")],
    },
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
      "da",
    ),
    "Rettigheder\n\nDu har ret til\nat stemme.\n\nPligter\n\nSe loven nu et kort\n\nlinje et\nlinje to\n\na\n\nb",
  );
});

test("in the narration script, bullets drop, numbered items keep their numbers, struck-through text is left out, and a divider is a blank line", () => {
  assert.equal(
    narrationScript(
      "Medbring:\n\n- Pas\n- [x] **Foto**\n  1. Farve\n  2. *Ny* ~~sort-hvid~~\n\n---\n\n3. Ansøg\n4. Betal ~~500~~ 600 kr.\n\n~~Gammel regel~~\n\nSlut",
      "da",
    ),
    "Medbring:\n\nPas\n\nFoto\n\n1. Farve\n\n2. Ny \n\n\n\n3. Ansøg\n\n4. Betal  600 kr.\n\nSlut",
  );
});

test("the narration script of plain text is that text", () => {
  const content = "ข้อแรก\nบรรทัดที่สอง\n\nข้อสอง";
  assert.equal(narrationScript(content, "th"), content);
});

test("each note kind has its label in da, en and th", () => {
  assert.deepEqual(noteLabels, {
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
  });
});

test("in the narration script, a labelled note reads as label: text in the Language, and an unlabelled note as its text", () => {
  const content =
    "> [!TIP]\n> อ่านออกเสียง\n>\n> ทุกวัน\n\n> คำพูด\n\n> [!EXAM]\n> จำไว้";
  assert.equal(
    narrationScript(content, "th"),
    "เคล็ดลับ: อ่านออกเสียง\n\nทุกวัน\n\nคำพูด\n\n[!EXAM]\nจำไว้",
  );
  assert.equal(
    narrationScript("> [!CAUTION]\n> Gebyr\n\n> [!TIP] Læs højt.", "da"),
    "Forsigtig: Gebyr\n\nTip: Læs højt.",
  );
});
