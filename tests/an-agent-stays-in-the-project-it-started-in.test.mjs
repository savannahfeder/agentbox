// AGENTS STAY IN THE PROJECT THEY STARTED IN.
//
// Her rule has two halves and they pull opposite ways, so both are held here.
//
//   A FOLDER'S AGENTS MAY ONLY EVER LAND IN THAT FOLDER'S PROJECT. The card
//   reads the project side out of the chosen project's own `repoPath` and
//   re-reads it whenever the project changes, so what she is looking at and
//   where it lands are the same folder by construction. A later session that
//   "optimises" that re-read away breaks her rule silently, and the row it files
//   into the wrong inbox is the failure nobody notices for a week.
//
//   AND A FOLDER NO PROJECT POINTS AT IS THEREFORE UNREACHABLE, not merely
//   inconvenient. Measured on her Mac 2026-08-25: four agents in
//   `~/.claude/agents`, four in `~/Desktop/dev/sidecar-desktop/.claude/agents`,
//   nothing anywhere else, and no project of hers pointing at that folder. Half
//   her agents were behind a door with no handle. `findAgentFolders` is the
//   handle; the card offers to make the project that keeps them where they are.
//
// A DOT FOLDER IS NEVER A PROJECT, and that is measured too, not tidiness. The
// same scan over her home folder also lands on
// `~/.cursor/extensions/esbenp.prettier-vscode-12.4.0-universal/.claude/agents`,
// which is an editor extension shipping its own two and not a folder she works
// in. Skipping names beginning with a dot is the whole of what keeps it off the
// card, so it is the case tested hardest below.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAgentFolders, shortPath } from '../main/agent-files.mjs';
import {
  SECTION, destinations, folderOfProject, projectNameFor, unclaimed,
} from '../renderer/src/agent-import-card';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** A throwaway Mac, so nothing here reads her real home folder. */
function makeHome(shape) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-folders-'));
  for (const [rel, files] of Object.entries(shape)) {
    const dir = path.join(home, rel, '.claude', 'agents');
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(dir, f), '---\nname: x\n---\n');
  }
  return home;
}

/**
 * The file Claude Code keeps of every directory it has run in, which is how a
 * folder inside `~/Desktop` is reached now that the walk refuses to go in. */
function claudeRan(home, folders) {
  const projects = Object.fromEntries(folders.map((f) => [path.join(home, f), {}]));
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ projects }));
}

describe('finding the folders that are out of the card\'s reach', () => {
  it('finds a project folder two levels below a root, which is where hers is', () => {
    const home = makeHome({ 'Desktop/dev/sidecar-desktop': ['a.md', 'b.md', 'c.md', 'd.md'] });
    // `~/Desktop` is guarded, so the folder is reached by name and not by a
    // walk: Claude Code has run in it, which is what makes it hers to offer.
    claudeRan(home, ['Desktop/dev/sidecar-desktop']);
    const got = findAgentFolders({ home });
    expect(got).toHaveLength(1);
    expect(got[0].name).toBe('sidecar-desktop');
    expect(got[0].count).toBe(4);
    expect(got[0].short).toBe('~/Desktop/dev/sidecar-desktop');
  });

  it('never returns the home folder itself, which is the other side of the switch', () => {
    const home = makeHome({ '.': ['one.md'], 'dev/thing': ['two.md'] });
    const got = findAgentFolders({ home });
    expect(got.map((f) => f.name)).toEqual(['thing']);
  });

  it('skips dot folders, which is what keeps an editor extension off her card', () => {
    const home = makeHome({
      '.cursor/extensions/esbenp.prettier-vscode-12.4.0-universal': ['x.md', 'y.md'],
      'dev/real': ['z.md'],
    });
    expect(findAgentFolders({ home }).map((f) => f.name)).toEqual(['real']);
  });

  it('skips node_modules, where a dependency\'s own agents are not hers', () => {
    const home = makeHome({ 'dev/app/node_modules/some-dep': ['x.md'], 'dev/app': ['y.md'] });
    expect(findAgentFolders({ home }).map((f) => f.name)).toEqual(['app']);
  });

  it('counts only agent files, not the README somebody left in the folder', () => {
    const home = makeHome({ 'dev/app': ['a.md', 'b.md'] });
    const dir = path.join(home, 'dev/app/.claude/agents');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'hi');
    fs.writeFileSync(path.join(dir, '.DS_Store'), '');
    expect(findAgentFolders({ home })[0].count).toBe(2);
  });

  it('looks under the parent of every project folder she has already connected', () => {
    const home = makeHome({ 'work/team/side/deep-one': ['a.md'] });
    // Two levels below home reaches `work/team`, and no further.
    expect(findAgentFolders({ home })).toEqual([]);
    // Point a project at a sibling and the root comes with it.
    const got = findAgentFolders({ home, roots: [path.join(home, 'work/team/side')] });
    expect(got.map((f) => f.name)).toEqual(['deep-one']);
  });

  it('answers with nothing rather than throwing on a folder it cannot read', () => {
    expect(findAgentFolders({ home: path.join(os.tmpdir(), 'no-such-home-at-all') })).toEqual([]);
  });

  it('writes the path the way she reads it, with her account name folded away', () => {
    expect(shortPath('/Users/you/Desktop/dev/x', '/Users/you')).toBe('~/Desktop/dev/x');
    expect(shortPath('/opt/elsewhere', '/Users/you')).toBe('/opt/elsewhere');
  });
});

describe('a folder that already has a project is not offered again', () => {
  const folders = [
    { folder: '/Users/s/dev/sidecar-desktop', short: '~/dev/sidecar-desktop', name: 'sidecar-desktop', count: 4 },
    { folder: '/Users/s/dev/other', short: '~/dev/other', name: 'other', count: 1 },
  ];

  it('drops the ones a project points at', () => {
    const products = [{ slug: 'zero', name: 'Zero', repoPath: '/Users/s/dev/other' }];
    expect(unclaimed(folders, products).map((f) => f.name)).toEqual(['sidecar-desktop']);
  });

  it('ignores a trailing slash, which is how the same folder reads as two', () => {
    const products = [{ slug: 'z', name: 'Z', repoPath: '/Users/s/dev/other/' }];
    expect(unclaimed(folders, products).map((f) => f.name)).toEqual(['sidecar-desktop']);
  });

  it('leaves them all when no project has a folder at all', () => {
    expect(unclaimed(folders, [{ slug: 'a', name: 'A', repoPath: null }])).toHaveLength(2);
  });
});

describe('what the card says about them', () => {
  const one = [{ folder: '/Users/s/dev/sidecar-desktop', short: '~/Desktop/dev/sidecar-desktop', name: 'sidecar-desktop', count: 4, agents: [] }];

  it('opens on a name a person would keep, and does not ask her for it', () => {
    expect(projectNameFor({ name: 'sidecar-desktop' })).toBe('Sidecar Desktop');
    expect(projectNameFor({ name: 'zero' })).toBe('Zero');
    // Already named by a person: left exactly as they wrote it.
    expect(projectNameFor({ name: 'My Thing' })).toBe('My Thing');
    expect(projectNameFor(null)).toBe('');
  });

  it('heads the section with that name and the folder under it', () => {
    const dests = destinations({ found: { user: [], project: [] }, folders: one, products: [], project: null });
    expect(dests).toHaveLength(1);
    expect(dests[0].kind).toBe('new');
    expect(dests[0].name).toBe('Sidecar Desktop');
    expect(dests[0].where).toBe('~/Desktop/dev/sidecar-desktop');
  });

  it('says what pressing will do, in a badge and a foot line rather than twice a section', () => {
    expect(SECTION.newBadge).toBe('New project');
    // `SECTION.newWhy` was deleted 2026-08-26. It said in seventeen words, once
    // per section, what the badge and `pressLine` say between them once for the
    // whole press, and she read that card and said it was too much text.
    expect(SECTION.newWhy).toBeUndefined();
  });
});

describe('the half of her rule the code has to keep', () => {
  const card = read('renderer/src/components/ImportAgents.tsx');

  it('reads the project side out of the chosen project\'s own folder', () => {
    const products = [
      { slug: 'a', name: 'A', repoPath: '/dev/a' },
      { slug: 'b', name: 'B', repoPath: '/dev/b' },
    ];
    expect(folderOfProject(products, 'a')).toBe('/dev/a');
    expect(folderOfProject(products, 'b')).toBe('/dev/b');
  });

  it('re-reads that folder whenever the project changes, so the list and the inbox agree', () => {
    // The effect that reads her Mac is keyed on the folder AND the project. Drop
    // `folder` from that array and the card keeps one project's agents under
    // another project's name, which is her rule broken where nobody would look.
    expect(card).toMatch(/\}, \[folder, project\]\);/);
  });

  it('makes each project pointing at the folder its agents are already in', () => {
    expect(card).toMatch(/createProduct\(\{ name: f\.name, repoPath: f\.folder \}\)/);
  });

  it('never lists a folder\'s agents under a project that is not that folder', () => {
    const products = [{ slug: 'a', name: 'A', repoPath: '/dev/a' }];
    const found = {
      user: [{ name: 'home', title: 'Home', line: '', scope: 'all', path: '/home/.claude/agents/home.md' }],
      project: [{ name: 'mine', title: 'Mine', line: '', scope: 'project', path: '/dev/a/.claude/agents/mine.md' }],
    };
    const folders = [{ folder: '/dev/b', short: '~/dev/b', name: 'b', count: 1, agents: [{ name: 'theirs', title: 'Theirs', line: '', scope: 'project', path: '/dev/b/.claude/agents/theirs.md' }] }];
    const dests = destinations({ found, folders, products, project: 'a' });
    // Three sections: her home set, project A's own folder, and the folder that
    // is not a project yet. Nothing from /dev/b sits under A.
    expect(dests.map((d) => d.kind)).toEqual(['everywhere', 'project', 'new']);
    const a = dests.find((d) => d.kind === 'project');
    expect(a.items.map((i) => i.name)).toEqual(['mine']);
    const b = dests.find((d) => d.kind === 'new');
    expect(b.items.map((i) => i.name)).toEqual(['theirs']);
    expect(b.folder).toBe('/dev/b');
  });

  it('never says the Mac is empty over a card that has sections on it', () => {
    // `others` joined the gate on 2026-08-26: the folder scan is slower than the
    // file read, and at twenty folders the card had settled its ticks before the
    // scan landed. So "nothing here" now waits for BOTH answers, not one.
    // And `threads` joined it on 2026-08-29 for exactly the same reason, one
    // read slower again: a Mac with nine conversations and no agent files must
    // not be told it has nothing while the walk of ~/.claude/projects is running.
    expect(card).toContain('const read = !!found && !!others && threads !== null;');
    expect(card).toContain('{read && !some && (');
    expect(card).toContain('{!read && <div className="ia-empty">');
  });
});
