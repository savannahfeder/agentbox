// A TESTER CLICKING A TEXT BOX CAN TYPE IN IT (w-3d0fa23ffb, 2026-10-21).
//
// The power tester sat in the founder's room and could not say a word: three
// messages she typed into the room's chat box landed on the page body
// ("Typed 120 characters into body"), and she logged the chat as broken.
// browse.mjs clicked with el.click(), which fires a click but, unlike a
// person's click, puts no cursor in a text box. Boxes that focus themselves
// (a thread's reply) worked; the room's chat box, which waits for a click,
// never did. A click on a text field now also focuses it, as a person's does.
// Asserted on the source, as the click is a script the page runs.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const browse = fs.readFileSync(new URL('../.claude/skills/verify-agentbox/scripts/browse.mjs', import.meta.url), 'utf8');

it('a click on a text field puts the cursor in it', () => {
  const click = browse.slice(browse.indexOf("} else if (verb === 'click') {"), browse.indexOf("} else if (verb === 'type') {"));
  expect(click).toMatch(/el\.click\(\);\s*if \(el\.matches\('input, textarea, select, \[contenteditable\]'\)\) el\.focus\(\);/);
});
