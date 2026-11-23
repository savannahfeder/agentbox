// FILES HOME SHOWS WHAT THE TEAM KEPT, AND SETS THE REST APART.
//
// Files was one stream of everything any agent made: 229 files in one project,
// 18 versions of a call script across 4 threads, daily reports burying the
// rest, and a call plan "saved in one thread's designs folder and nobody could
// find it". Its owner: "not everything needs to be saved... What's important is
// stuff that the team actually wants to save." So a file is kept when someone
// puts it in a folder. The home shows each folder as a section of tiles, a
// folder called Pinned first, and everything no one filed in one section of its
// own after them. Approved picture: r5-2-white-tiles-bare-icon (round 5, Nov 22).
//
// What must NOT happen: a file that nobody filed mixed in with kept ones, a
// check picture an agent took counted as anything, another project's folder
// showing, or the search box claiming ⌘K, which is the whole app's command bar.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { docTop, firstLine, glyphFor, homeOf, isPinned, pinChangedLately, tileLine, tileName, whenWords } from '../renderer/src/files/files-home';

const DAY = 86_400_000;
const file = (over) => ({ key: over.name, project: 'Agentbox Team', name: 'a.md', kind: 'markdown', versions: 1, at: 1, by: null, open: 0, approvedBy: [], sentIn: [], opened: null, folder: null, ...over });
const folder = (id, name, over = {}) => ({ id, project: 'Agentbox Team', name, parent: null, at: 1, ...over });

describe('the sections', () => {
  const folders = [
    folder('cus', 'Customers'),
    folder('pin', 'Pinned'),
    folder('calls', 'Calls', { parent: 'cus' }),
    folder('brand', 'Brand kit'),
    folder('other', 'Launch', { project: 'Lantern' }),
  ];
  const files = [
    file({ name: 'northwind.md', folder: 'cus', at: 50 }),
    file({ name: 'call-notes.md', folder: 'calls', at: 90 }),
    file({ name: 'positioning.md', folder: 'pin', at: 10 }),
    file({ name: 'pricing.md', folder: 'pin', at: 20 }),
    file({ name: 'loose-draft.md', at: 70 }),
    file({ name: 'lost.md', folder: 'deleted-folder', at: 60 }),
    file({ name: 'page-2026-11-21T10-00-00-000Z.png', kind: 'image', agent: 'Claude Code', at: 99 }),
    file({ name: 'lantern-plan.md', project: 'Lantern', folder: 'other', at: 80 }),
  ];
  const home = homeOf(files, folders, 'Agentbox Team');

  it('puts Pinned first, then the folder that changed last', () => {
    expect(home.kept.map((s) => s.folder.name)).toEqual(['Pinned', 'Customers']);
  });
  it('holds a subfolder\'s files in its folder\'s section, newest first', () => {
    expect(home.kept[1].files.map((f) => f.name)).toEqual(['call-notes.md', 'northwind.md']);
    expect(home.kept[0].files.map((f) => f.name)).toEqual(['pricing.md', 'positioning.md']);
  });
  it('lists an empty folder apart, not as a section of nothing', () => {
    expect(home.empty.map((f) => f.name)).toEqual(['Brand kit']);
  });
  it('sets apart what nobody filed, a folder that is gone counting as none', () => {
    expect(home.loose.map((f) => f.name)).toEqual(['loose-draft.md', 'lost.md']);
  });
  it('leaves out an agent\'s check picture and another project\'s files', () => {
    const every = [...home.kept.flatMap((s) => s.files), ...home.loose].map((f) => f.name);
    expect(every).not.toContain('page-2026-11-21T10-00-00-000Z.png');
    expect(every).not.toContain('lantern-plan.md');
  });
  it('is all apart for a project with no folders yet', () => {
    const bare = homeOf([file({ name: 'x.md' })], [], 'Agentbox Team');
    expect(bare.kept).toEqual([]);
    expect(bare.loose.map((f) => f.name)).toEqual(['x.md']);
  });
});

describe('Pinned', () => {
  it('is a folder named that, whatever its capitals', () => {
    expect(isPinned({ name: 'Pinned' })).toBe(true);
    expect(isPinned({ name: 'pinned' })).toBe(true);
    expect(isPinned({ name: 'Pinned ideas' })).toBe(false);
    expect(isPinned({ name: 'Unpinned' })).toBe(false);
  });
  it('marks a pinned file changed in the last week, and nothing else', () => {
    const now = 100 * DAY;
    expect(pinChangedLately({ name: 'Pinned' }, file({ at: now - 2 * DAY }), now)).toBe(true);
    expect(pinChangedLately({ name: 'Pinned' }, file({ at: now - 8 * DAY }), now)).toBe(false);
    expect(pinChangedLately({ name: 'Customers' }, file({ at: now - DAY }), now)).toBe(false);
  });
});

describe('what a tile says', () => {
  it('is a document\'s first sentence under its title', () => {
    expect(firstLine('# Pricing\n\n$40 a seat a month. The first 7 days are **free**.\n\n## Rules')).toBe('$40 a seat a month. The first 7 days are free.');
    expect(firstLine('# Northwind\n\n- Two founders\n- Calls every day')).toBe('Two founders');
    expect(firstLine('Notes straight away, no title.')).toBe('Notes straight away, no title.');
  });
  it('is nothing for a document with only a title, or none at all', () => {
    expect(firstLine('# Team look')).toBeNull();
    expect(firstLine('')).toBeNull();
  });
  it('names a document by its title, then a name a person gave it, then its file name written out', () => {
    expect(tileName(file({ name: 'positioning.md' }), 'Positioning')).toBe('Positioning');
    expect(tileName(file({ name: 'positioning.md', title: 'Our pitch' }), 'Positioning')).toBe('Our pitch');
    expect(tileName(file({ name: 'first-onboarding-call-2026-11-21-v18.md' }), null)).toBe('First onboarding call 2026-11-21');
    expect(docTop('# Pricing\n\n$40 a seat.')).toEqual({ title: 'Pricing', line: '$40 a seat.' });
  });
  it('leaves a picture\'s name as it is', () => {
    expect(tileName(file({ name: 'agentcloud-feed-1.png', kind: 'image' }), null)).toBe('agentcloud-feed-1.png');
  });
  it('says Today, Yesterday, or the day it last changed', () => {
    const now = new Date(2026, 10, 22, 15, 0).getTime();
    expect(whenWords(new Date(2026, 10, 22, 0, 5).getTime(), now)).toBe('Today');
    expect(whenWords(new Date(2026, 10, 21, 23, 55).getTime(), now)).toBe('Yesterday');
    expect(whenWords(new Date(2026, 10, 20, 12, 0).getTime(), now)).toBe('Nov 20');
  });
  it('is the thread it came from for anything that is not a document', () => {
    expect(tileLine(file({ kind: 'image', sentIn: [{ kind: 'thread', title: 'Agentcloud launch posts' }] }))).toBe('Agentcloud launch posts');
    expect(tileLine(file({ kind: 'film', sentIn: [] }))).toBe('Film');
  });
});

describe('a tile\'s icon', () => {
  it('follows a word in its name', () => {
    expect(glyphFor(file({ name: 'pricing.md' }))).toBe('tag');
    expect(glyphFor(file({ name: 'positioning.md' }))).toBe('compass');
    expect(glyphFor(file({ name: 'Onboarding call script.md' }))).toBe('phone');
    expect(glyphFor(file({ name: 'user-feedback.md' }))).toBe('people');
  });
  it('needs the word to start a part of the name', () => {
    expect(glyphFor(file({ name: 'agentcloud-feed-1.png', kind: 'image' }))).toBe('image');
    expect(glyphFor(file({ name: 'cloud-costs.md' }))).toBe('cloud');
  });
  it('takes its folder\'s word when its own name has none, but never Pinned\'s', () => {
    expect(glyphFor(file({ name: 'northwind.md' }), 'Customers')).toBe('people');
    expect(glyphFor(file({ name: 'pricing.md' }), 'Customers')).toBe('tag');
    expect(glyphFor(file({ name: 'notes.md' }), 'Pinned')).toBe('page');
  });
  it('knows the product\'s own words', () => {
    expect(glyphFor(file({ name: 'engines-and-harnesses.md' }))).toBe('chip');
    expect(glyphFor(file({ name: 'Phone app.md' }))).toBe('mobile');
    expect(glyphFor(file({ name: 'team-version.md' }))).toBe('layers');
    expect(glyphFor(file({ name: 'Team look.md' }))).toBe('palette');
  });
  it('falls back to what kind of file it is', () => {
    expect(glyphFor(file({ name: 'notes.md' }))).toBe('page');
    expect(glyphFor(file({ name: 'leads.csv', kind: 'table' }))).toBe('table');
    expect(glyphFor(file({ name: 'demo.mp4', kind: 'film' }))).toBe('film');
    expect(glyphFor(file({ name: 'x', kind: null }))).toBe('page');
  });
});

describe('the page itself', () => {
  const tsx = fs.readFileSync(new URL('../renderer/src/files/FilesHome.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../renderer/src/files/files-home.css', import.meta.url), 'utf8');
  it('offers / for its search, never the command bar\'s ⌘K', () => {
    expect(tsx).toMatch(/>\/</);
    expect(tsx).not.toMatch(/⌘K|Cmd\+K|Ctrl\+K/);
  });
  it('draws every box it borders with rounded corners', () => {
    for (const rule of css.split('}')) {
      if (/border:\s*1px|box-shadow:\s*(?:inset\s+)?0 0 0 1px/.test(rule)) expect(rule, rule).toMatch(/border-radius/);
    }
  });
  it('keeps the accent to the one dot', () => {
    const uses = css.split('}').filter((r) => r.includes('var(--accent)'));
    expect(uses.length).toBe(1);
    expect(uses[0]).toMatch(/\.fh-dot/);
  });
  it('is what / focuses on the Files page', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/querySelector<HTMLInputElement>\('\.fp-find input'\)/);
    expect(tsx).toMatch(/className="fp-find fh-find"/);
  });
  // Seen on the first home: "it doesn't change to the little hand icon", and every
  // click opened something the person meant only to point at.
  it('shows the hand on everything that opens or goes somewhere', () => {
    for (const cls of ['.fh-open', '.fh-link', '.fh-crumb']) {
      const rule = css.split('}').find((r) => r.trim().startsWith(cls) && /cursor/.test(r));
      expect(rule, cls).toMatch(/cursor: pointer/);
    }
  });
  it('opens a tile\'s menu on a right click as well as on its ⋯', () => {
    expect(tsx).toMatch(/onContextMenu=/);
  });
  it('offers what a person does to a file and a folder in their menus', () => {
    for (const words of ['Rename', 'Change icon', 'Move to', 'Move to the Trash', 'Delete folder']) expect(tsx).toContain(words);
  });
  it('makes a section\'s name a way into its own page', () => {
    expect(tsx).toMatch(/className="fh-link"[^>]*onClick=\{\(\) => onFolder\(/);
  });
  // Seen on r7-3: "There's a little arrow that makes me think this is a dropdown
  // ... not that this is a header for these sections."
  it('draws a section\'s name as a heading, with no arrow beside it', () => {
    expect(tsx).not.toMatch(/className="fh-link"[^>]*>[^<]*\{?[^<]*<Chevron/);
    expect(tsx).toMatch(/<h2 className="fh-head-name">/);
    const rule = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').find((r) => r.trim().startsWith('.fh-head-name'));
    expect(Number(/font-size: (\d+)px/.exec(rule ?? '')?.[1])).toBeGreaterThanOrEqual(18);
  });
  it('puts See all at the end of the heading\'s row, not under the tiles', () => {
    expect(tsx).toMatch(/className="fh-see-all"/);
  });
});
