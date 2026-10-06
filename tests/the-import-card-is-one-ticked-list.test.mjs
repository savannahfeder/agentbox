// THE IMPORT CARD IS ONE TICKED LIST.
//
// The founder on the old card (w-db6f5e331e, 2026-10-05), over a picture of its
// "Choose which ones" screen: "very confusing, can't figure out what it does or
// how it works. super cluttered, unattractive and confusing." It was two
// screens (a door with "Add all" and "Choose which ones", then a chooser), and
// the chooser was a block per folder with a tick for the block, a count, a
// caret to open it, a NEW PROJECT tag, the folder's path, and ticks inside.
//
// Three drawings went to her; she picked A: "Every recent conversation is a
// single line, already ticked, showing where it came from and when. One
// button: 'Add 6 to your inbox'. No folders, no project tags, no second
// screen." This pins that card, in ⌘K and on the walk's last screen alike.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { LIST, importLines } from '../renderer/src/agent-import-card';

const DAY = 86400e3;
const NOW = Date.now();
const thread = (id, source, daysAgo, title) => ({
  id, source, folder: `/w/${id}`, folderName: id, short: `~/w/${id}`, title, when: NOW - daysAgo * DAY, path: `/t/${id}`,
});
const dests = [
  { key: 'everywhere', kind: 'everywhere', name: 'Landing Page', slug: 'landing-page', folder: null, where: '~/.claude/agents',
    items: [{ name: 'reviewer', title: 'Reviewer', line: 'Reviews code', scope: 'all', path: '/a/reviewer.md' }], threads: [] },
  { key: 'project:landing-page', kind: 'project', name: 'Landing Page', slug: 'landing-page', folder: '/w/a', where: '~/w/a', items: [],
    threads: [thread('a', 'codex', 0, 'Make the hero image load faster'), thread('b', 'terminal', 1, 'Make the menu work on phones')] },
  { key: 'new:/w/c', kind: 'new', name: 'Orders Api', slug: null, folder: '/w/c', where: '~/w/c', items: [],
    threads: [thread('c', 'desktop', 8, 'Add a test for late orders')] },
];

describe('the lines', () => {
  const lines = importLines(dests);

  it('is one line per conversation or agent, with no folder or project block', () => {
    expect(lines.map((l) => l.title)).toEqual([
      'Make the hero image load faster', 'Make the menu work on phones', 'Add a test for late orders', 'Reviewer',
    ]);
  });

  it('says where each came from and when, newest first', () => {
    expect(lines[0].meta).toBe('Codex · Landing Page · today');
    expect(lines[1].meta).toBe('Claude Code · Landing Page · yesterday');
    expect(lines[2].meta).toMatch(/^Claude Code · Orders Api · [A-Z][a-z]+ \d+$/);
  });

  it('names an agent file as a Claude Code agent, with no day', () => {
    expect(lines[3].meta).toBe('Claude Code agent · Landing Page');
  });

  it('carries no project tag: a project made on the press is just its name', () => {
    expect(lines.map((l) => l.meta).join(' ')).not.toMatch(/new project/i);
  });
});

describe('the button and the words', () => {
  it('says how many it adds', () => {
    expect(LIST.add(6)).toBe('Add 6 to your inbox');
    expect(LIST.add(1)).toBe('Add 1 to your inbox');
    expect(LIST.add(0)).toBe('Nothing ticked');
  });
  it('heads the card plainly', () => {
    expect(LIST.head).toBe('Bring in your recent agents');
    expect(LIST.line).toBe('From the last 10 days. Untick any you want to leave out.');
    expect(LIST.notNow).toBe('Not now');
  });
});

describe('the card', () => {
  const card = fs.readFileSync(new URL('../renderer/src/components/ImportAgents.tsx', import.meta.url), 'utf8');
  it('has one screen: no door, no chooser, no folder blocks', () => {
    expect(card).not.toMatch(/'door' \| 'pick'/);
    expect(card).not.toContain('ia-blk');
    expect(card).not.toContain('SECTION.newBadge');
    expect(card).not.toContain('DOOR.pick');
  });
  it('starts with every line ticked, and keeps only what was unticked', () => {
    expect(card).toContain('const picked = useMemo(() => lines.map((l) => l.path).filter((p) => !unticked.has(p)), [lines, unticked]);');
  });
  // Carried over from a-project-is-a-thing-you-can-tick.test.mjs, which pinned
  // the two-screen card and was retired with it. These two still hold.
  it('waits for the whole Mac to be read before it draws a line or a count', () => {
    expect(card).toContain('const read = !!found && !!others && threads !== null;');
    expect(card).toContain('{!read && <div className="ia-empty">{CARD.reading}</div>}');
    expect(card).toContain('{read && some && (\n          <div className="ia-scroll ia-lines">');
  });
  it('has one shape of the list and no switch between looks', () => {
    expect(card).not.toMatch(/setLook\b|ia-only|ia-door/);
  });

  it('adds what is ticked with one press, the button saying how many', () => {
    expect(card).toContain('{LIST.add(picked.length)}');
    expect(card).toContain('onClick={() => bring(picked)}');
  });
});
