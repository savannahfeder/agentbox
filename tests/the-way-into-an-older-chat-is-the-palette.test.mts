// WHERE YOU GO TO BRING IN A CHAT YOU ALREADY HAD.
//
// GitHub #31 is right that the import had to reach past ten days and wrong
// about the door: it put an "Add chat" button in the inbox header, beside New
// thread. That header carries what is pressed every day and had already been
// cut back for reading as cluttered (w-3c51d02de5, 2026-10-14, when Search
// lost its word and became a magnifier). A chat you had in July is remembered,
// not routine.
//
// The founder, on this row: "the entry point is wrong ... Find the right way
// in, starting from the New thread flow and ⌘K."
//
// The New thread card was tried and rejected too (2026-10-16): "This chat
// really clutters a component that we use all the time so I would disagree
// with that." Same objection as the header, and it holds — that card opens all
// day, and a line one keystroke from vanishing is still drawn every time.
//
// So ⌘K is the door, and this pins three facts:
//   1. ⌘K keeps the row it has always had, and its hint no longer promises
//      only ten days now that the card reaches a year.
//   2. The New thread card carries nothing about importing.
//   3. The inbox header gains nothing.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const palette = read('renderer/src/components/Palette.tsx');
const composer = read('renderer/src/threads/ThreadComposer.tsx');
const header = read('renderer/src/threads/Pages.tsx');
const app = read('renderer/src/App.tsx');
const composerCss = read('renderer/src/threads/thread-composer.css');

describe('the ⌘K row', () => {
  const row = palette.slice(palette.indexOf("id: 'import-agents'"), palette.indexOf("id: 'import-agents'") + 700);

  it('is still there, and still opens the import card', () => {
    expect(row).toContain('run: onImportAgents');
  });

  it('no longer promises only the last ten days, because the card reaches past them', () => {
    expect(row).not.toMatch(/last ten days/i);
    // "by name" is the half that says older ones are reachable at all. It was
    // spelled out until 2026-10-16, when the row was cut for overflowing;
    // tests/a-palette-row-never-stacks-onto-two-lines keeps it short.
    expect(row).toMatch(/by name/i);
  });

  it('is found by the words somebody looking for an old chat would type', () => {
    const keywords = row.slice(row.indexOf('keywords:'), row.indexOf('run:'));
    for (const w of ['older', 'chat', 'find', 'search', 'name']) expect(keywords).toContain(w);
  });
});

describe('the New thread card', () => {
  // IT CARRIES NOTHING, and that is the decision (2026-10-16). The offer lived
  // here for one round as a faint line on an empty card, taken away by the
  // first letter typed. The founder, on the picture: "This chat really
  // clutters a component that we use all the time so I would disagree with
  // that." A line that is one keystroke from gone is still drawn every time
  // the card opens, and this card opens all day.
  it('offers nothing about importing: it is opened too often to carry one', () => {
    expect(composer).not.toMatch(/Already had this chat/i);
    expect(composer).not.toMatch(/tc-had/);
    expect(composer).not.toMatch(/onImportChats/);
  });

  it('is not wired to the import card from the app either', () => {
    expect(app).not.toMatch(/onImportChats/);
  });

  it('left no dead style behind', () => {
    expect(composerCss).not.toMatch(/tc-had/);
  });
});

describe('the inbox header', () => {
  // `HeaderActions` is the right end of the Inbox header and the whole of what
  // #31 was adding to. Read it alone: the file's own `import` lines at the top
  // are not buttons.
  const actions = header.slice(header.indexOf('export function HeaderActions'), header.indexOf('const toggle = <T,>'));

  it('gains no button: it carries what is pressed daily and this is not', () => {
    expect(actions).not.toMatch(/Add chat/i);
    expect(actions).not.toMatch(/import/i);
  });

  it('still carries the ones it had', () => {
    expect(actions).toContain('New thread');
    expect(actions).toContain('<SearchButton');
    expect(actions).toContain('th-disp');
  });
});

describe('every word on the way in is English', () => {
  it('carries nothing left over from the pull request it came from', () => {
    const german = /Bestehenden|hinzufügen|Wähle|ältere|Suche nach/;
    for (const [name, src] of [['palette', palette], ['composer', composer], ['card', read('renderer/src/agent-import-card.ts')]]) {
      expect(german.test(src), name).toBe(false);
    }
  });
});
