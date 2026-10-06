// THE FOLDER IS THE PROJECT, AND SHE DOES NOT MAKE IT.
//
// Two faults in one message and both are tested here.
//
//   DETECTION INSTEAD OF A FORM. The old card found the folder, printed it in a
//   sentence, and then wanted her to press a word, type a name and press a
//   second button before one agent moved. Every part of that except the typing
//   was already known to the app. So the name is derived, the section is drawn
//   with it, and the project is made on the same press that files the rows.
//
//   AND A HIERARCHY INSTEAD OF FOUR GREY LINES. `destinations` is the shape:
//   one section per inbox, each with a name, a folder and its own agents. The
//   test that matters is not how it looks, which nobody can photograph twice,
//   but that every agent on the card belongs to exactly one section and that
//   section is the only inbox it can reach.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SECTION, allPicked, bringAllLine, canBring, destinations, importedLine, importLines, projectNameFor,
  slugFor, togglePicked,
} from '../renderer/src/agent-import-card';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const agent = (name, dir) => ({
  name, title: name, line: '', scope: 'project', path: `${dir}/.claude/agents/${name}.md`,
});
const home = (name) => ({
  name, title: name, line: '', scope: 'all', path: `/Users/s/.claude/agents/${name}.md`,
});

/**
 * Her own Mac, measured 2026-08-25: four agents in the home folder, four in
 *  `~/Desktop/dev/sidecar-desktop`, and no project pointing at that folder. */
const HERS = {
  found: {
    user: ['leon-okafor-qa', 'localhost-qa', 'qa-browser-tester', 'sketch'].map(home),
    project: [],
  },
  folders: [{
    folder: '/Users/s/Desktop/dev/sidecar-desktop',
    short: '~/Desktop/dev/sidecar-desktop',
    name: 'sidecar-desktop',
    count: 4,
    agents: ['cleanup-analyzer', 'docs-reviewer', 'plan-checker', 'userguide-reviewer']
      .map((n) => agent(n, '/Users/s/Desktop/dev/sidecar-desktop')),
  }],
  products: [{ slug: 'agentbox', name: 'Agentbox', repoPath: '/Users/s/Desktop/dev/zero' }],
};

describe('her own Mac, drawn as a hierarchy', () => {
  const dests = destinations({ ...HERS, project: 'agentbox' });

  it('draws one section per inbox, not one paragraph with a link in it', () => {
    expect(dests.map((d) => d.kind)).toEqual(['everywhere', 'new']);
  });

  it('heads the folder section with the project it is about to become', () => {
    const d = dests[1];
    expect(d.name).toBe('Sidecar Desktop');
    expect(d.where).toBe('~/Desktop/dev/sidecar-desktop');
    expect(d.items).toHaveLength(4);
  });

  it('names the folder\'s four agents on the card, where the old one counted them', () => {
    expect(dests[1].items.map((a) => a.name)).toEqual([
      'cleanup-analyzer', 'docs-reviewer', 'plan-checker', 'userguide-reviewer',
    ]);
  });

  it('leaves the home set as the only section whose inbox is a choice', () => {
    expect(dests[0].slug).toBe('agentbox');
    expect(dests[1].slug).toBe(null);
  });

  it('offers all eight on one press, without her ticking anything', () => {
    // This used to be `pickedAtOpen`, which ticked the card for her. Since the
    // two doors landed on 2026-08-26 the first door takes the whole card and
    // the choose screen opens empty, so all eight is a press and not a state.
    expect(allPicked(dests)).toHaveLength(8);
    expect(bringAllLine(dests)).toBe('Add all eight agents');
  });

  it('can be pressed with nothing existing to file the folder\'s agents into', () => {
    const only = dests[1].items.map((a) => a.path);
    expect(canBring({ read: true, picked: only, dests })).toBe(true);
  });
});

describe('nothing on this card asks her to make a project', () => {
  const card = read('renderer/src/components/ImportAgents.tsx');
  const words = read('renderer/src/agent-import-card.ts');

  it('has no name field and no second button to press', () => {
    expect(card).not.toContain('ia-field');
    expect(card).not.toContain('setNaming');
    expect(words).not.toContain('nameIt');
  });

  it('makes the project inside the press that brings the agents in', () => {
    const press = card.slice(card.indexOf('const bring ='), card.indexOf('⌘↵ ADDS WHAT IS TICKED'));
    expect(press).toContain('api.createProduct(');
    expect(press).toContain('api.importAgents(');
  });

  // CHANGED 2026-10-05 (w-db6f5e331e). This said so before the press, with a
  // NEW PROJECT badge and a line under the door. Her pick for the one-list card
  // was "No folders, no project tags", so the new project is only its name on
  // the line, and it is made on the press exactly as before (the test above).
  it('names the project a line lands in, and tags none of them as new', () => {
    expect(SECTION.newWhy).toBeUndefined();
    expect(card).not.toContain('{SECTION.newBadge}');
    expect(card).not.toContain('pressLine(');
    const lines = importLines([{ key: 'new:/w/x', kind: 'new', name: 'Orders Api', slug: null, folder: '/w/x', where: '~/w/x', items: [],
      threads: [{ id: 't', source: 'codex', folder: '/w/x', folderName: 'x', short: '~/w/x', title: 'T', when: Date.now(), path: '/t' }] }]);
    expect(lines[0].meta).toBe('Codex · Orders Api · today');
  });
});

describe('a tick belongs to one folder', () => {
  // TWO FOLDERS, ONE NAME. `~/dev/api` and `~/work/api` can both hold an agent
  // called `reviewer`, and before 08-26 the ticks were keyed by that name. With
  // several folders on one card, ticking one would have ticked the other.
  const folders = [
    { folder: '/Users/s/dev/api', short: '~/dev/api', name: 'api', count: 1, agents: [agent('reviewer', '/Users/s/dev/api')] },
    { folder: '/Users/s/work/api', short: '~/work/api', name: 'api', count: 1, agents: [agent('reviewer', '/Users/s/work/api')] },
  ];
  const dests = destinations({ found: { user: [], project: [] }, folders, products: [], project: null });

  it('turns one on without turning the other on', () => {
    const first = dests[0].items[0].path;
    const after = togglePicked(dests, allPicked(dests), first);
    expect(after).toEqual([dests[1].items[0].path]);
  });

  it('proposes two names the store will accept, not the same one twice', () => {
    expect(dests.map((d) => d.name)).toEqual(['Api', 'Api 2']);
    expect(new Set(dests.map((d) => slugFor(d.name))).size).toBe(2);
  });

  it('steps around a project she already has by that name', () => {
    const taken = [{ slug: 'api', name: 'Api', repoPath: '/Users/s/elsewhere' }];
    const got = destinations({ found: { user: [], project: [] }, folders, products: taken, project: null });
    expect(got.map((d) => d.name)).toEqual(['Api 2', 'Api 3']);
  });

  it('derives the same slug the store does, which is what makes that check real', () => {
    expect(slugFor('Sidecar Desktop')).toBe('sidecar-desktop');
    expect(slugFor('Api 2')).toBe('api-2');
    expect(projectNameFor({ name: 'api' }, ['Api'])).toBe('Api 2');
  });
});

describe('what she is told after the press', () => {
  it('names the one inbox when there is one, the way it always did', () => {
    expect(importedLine({ added: 4, already: 0, name: 'Agentbox' }))
      .toBe('Four rows are in your Agentbox inbox.');
  });

  it('says the project is new when the press made it', () => {
    expect(importedLine({ added: 4, already: 0, name: 'Sidecar Desktop', made: ['Sidecar Desktop'] }))
      .toBe('Four rows are in your new Sidecar Desktop inbox.');
  });

  it('counts the inboxes rather than naming one of three', () => {
    expect(importedLine({ added: 8, already: 0, inboxes: 2, made: ['Sidecar Desktop'] }))
      .toBe('Eight rows are in two inboxes. Sidecar Desktop is new.');
  });

  it('still says what already had rows, which is the ordinary second press', () => {
    expect(importedLine({ added: 0, already: 8, inboxes: 2 }))
      .toBe('Eight of them already have rows.');
    expect(importedLine({ added: 0, already: 1, name: 'Agentbox' }))
      .toBe('That agent already has a row in Agentbox.');
  });

  it('never says a number as a digit in a sentence she reads', () => {
    for (const s of [
      importedLine({ added: 4, already: 0, name: 'Agentbox' }),
      importedLine({ added: 8, already: 2, inboxes: 3, made: ['A', 'B'] }),
      importedLine({ added: 0, already: 0 }),
    ]) expect(s).not.toMatch(/\d/);
  });
});
