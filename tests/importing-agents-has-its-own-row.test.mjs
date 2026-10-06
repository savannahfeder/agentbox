// IMPORTING YOUR CLAUDE CODE AGENTS IS A ⌘K ROW.
//
// The offer existed on the last card of the first run and nowhere else. Press
// past that card, or install Claude Code the day after setting Agentbox up, and
// the only way back was to walk the whole setup again and make a spare project
// on the way.
//
// Four things below are the ones a later session would undo without noticing:
//
//   THE ROW EXISTS AND SAYS THE WORD SHE WOULD TYPE. "Agents" is that word, and
//   it is why this file checks the match rather than the label alone: the
//   palette filters on label plus keywords (../renderer/src/palette-rows).
//
//   IT IS THE SAME IMPORT, NOT A SECOND ONE. The card draws the walk's own rows
//   and foot and calls the same channel. Two imports that drift apart is worse
//   than no second door.
//
// The walk's two-sided SWITCH is the one thing this card stopped sharing, on
// 08-26.Inside the walk there is one project and one folder, so two sides is
// the whole truth there. Out here the sides were never two, and the card is a
// section per inbox now (`destinations`). The rows inside those sections are
// still the walk's.
//
//   IT NAMES THE INBOX THE ROWS LAND IN. Inside the walk there is exactly one
//   project; out here there are all of hers, and a row filed into the wrong
//   project is the failure nobody notices for a week.
//
//   AND THE SECOND PRESS TELLS THE TRUTH. The card opens with what was taken
//   last time still ticked, so pressing it again is the ordinary case and the
//   store does not move (`agentsNeedingRows`). Saying "three imported" over a
//   store that did not move is the exact defect this import had until 08-23.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesQuery } from '../renderer/src/palette-rows';
import { NAME, Name } from '../shared/product-name.mjs';
import {
  CARD, SECTION, canBring, destinations, folderOfProject, importedLine, importLines,
  nameOfProject, projectAtOpen,
} from '../renderer/src/agent-import-card';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const palette = read('renderer/src/components/Palette.tsx');
const card = read('renderer/src/components/ImportAgents.tsx');
const app = read('renderer/src/App.tsx');
const api = read('renderer/src/api.ts');

/**
 * The row's own object literal, so a keyword added to a neighbour cannot make
 *  this file pass. */
const row = (() => {
  const at = palette.indexOf("id: 'import-agents'");
  expect(at, 'no import-agents row in ⌘K').toBeGreaterThan(-1);
  const text = palette.slice(at, palette.indexOf('},', at));
  const field = (name) => text.match(new RegExp(`${name}: '([^']*)'`))?.[1] ?? '';
  return { label: field('label'), hint: field('hint'), keywords: field('keywords') };
})();

describe('the row is in ⌘K and can be found by the words she would type', () => {
  it('is there, and it says what it does', () => {
    expect(row.label).toBe('Import agents from Claude Code or Codex');
    expect(row.hint).toBeTruthy();
  });

  it('is still found by "bring", which is what the row said until 08-25', () => {
    expect(matchesQuery('bring', row), 'the old label finds nothing').toBe(true);
  });

  it('is found by "agents", by "import" and by "claude code"', () => {
    for (const typed of ['agents', 'import', 'import agents', 'claude code', 'my agents', 'codex', 'import codex']) {
      expect(matchesQuery(typed, row), `typing "${typed}" found nothing`).toBe(true);
    }
  });

  it('sits ABOVE walking the whole setup again, which was the only way in', () => {
    expect(palette.indexOf("id: 'import-agents'")).toBeLessThan(palette.indexOf("id: 'first-run'"));
  });

  it('is wired to a real card rather than to a toast', () => {
    expect(palette).toContain('run: onImportAgents,');
    expect(app).toContain('onImportAgents={() => { setModal(null); setImportAgents(true); }}');
    expect(app).toContain('<ImportAgents');
  });
});

describe('it is the walk\'s import, not a second one', () => {
  // THE ROWS STOPPED BEING THE WALK'S ROWS.So the card has its own rows now,
  // `ia-agent` rather than the walk's `fr-agent`, and the thing this test is
  // really guarding is that it is still the SAME IMPORT: the same reader, the
  // same channel, the same promise in the same words. Those three are checked
  // below and they are what "not a second one" meant.
  it('draws its own rows, and the walk\'s promise word for word', () => {
    // The foot line ("never moves the file") left with the one-list card on
    // w-db6f5e331e: her pick was one list and one button and nothing else.
    for (const cls of ['ia-agent', 'ia-agent-name', 'ia-box']) {
      expect(card, `the card lost its ${cls}`).toContain(cls);
    }
    expect(card).toContain("from '../onboarding'");
  });

  it('calls the same channel the walk\'s button calls', () => {
    // ONE HELPER FOR BOTH KINDS since 2026-08-29: a section can now hold her
    // agent files and her own threads, they land in one inbox, and `file` is
    // what puts them there. The channel is still the walk's.
    expect(card).toContain('api.importAgents({ product: slug, agents: load.names })');
    expect(card).toContain('api.importThreads({ product: slug, threads: load.ids })');
    expect(card).toContain('await file(slug, load);');
    expect(card).toContain('await file(slug, f.load);');
  });

  it('re-reads the Mac when the project changes, because the project scope IS its folder', () => {
    const effect = card.slice(card.indexOf('READ AGAIN WHENEVER THE PROJECT CHANGES'));
    expect(effect).toContain('api.agentFiles({ folder, product: project })');
    expect(effect.slice(0, effect.indexOf('const some'))).toContain('}, [folder, project]);');
  });
});

describe('where the rows land is on the card, in words', () => {
  const products = [
    { slug: 'agentbox', name: Name, repoPath: '/Users/x/dev/zero' },
    { slug: 'lantern', name: 'Lantern', repoPath: null },
  ];

  it('opens on the project the inbox is filtered to', () => {
    expect(projectAtOpen(products, { filter: 'lantern', last: 'agentbox' })).toBe('lantern');
  });

  it('falls back to the one her last task was addressed to', () => {
    expect(projectAtOpen(products, { filter: null, last: 'lantern' })).toBe('lantern');
  });

  it('ignores a filter or a memory pointing at a project that is gone', () => {
    expect(projectAtOpen(products, { filter: 'deleted', last: 'also-gone' })).toBe('agentbox');
  });

  // CHANGED 2026-10-05 (w-db6f5e331e): the one-list card has no project
  // control. Her home folder agents land in the project the card opened on
  // (`projectAtOpen` above), and the line names it.
  it('names, on the line, the project a home folder agent lands in', () => {
    const dests = destinations({
      found: { user: [{ name: 'a', title: 'A', line: '', scope: 'all', path: '/h/a.md' }], project: [] },
      folders: [], products, project: 'agentbox',
    });
    expect(importLines(dests)[0].meta).toBe(`Claude Code agent · ${nameOfProject(products, 'agentbox')}`);
    expect(card).not.toContain('aria-expanded={picking}');
  });

  it('reads the folder off the project it is filing into', () => {
    expect(folderOfProject(products, 'agentbox')).toBe('/Users/x/dev/zero');
    expect(folderOfProject(products, 'lantern')).toBe(null);
    expect(nameOfProject(products, 'lantern')).toBe('Lantern');
  });

  it('has nowhere to file into with no projects, and says that instead', () => {
    expect(projectAtOpen([], {})).toBe(null);
    const homeless = destinations({
      found: { user: [{ name: 'a', title: 'A', line: '', scope: 'all', path: '/h/a.md' }], project: [] },
      folders: [], products: [], project: null,
    });
    expect(canBring({ read: true, picked: ['/h/a.md'], dests: homeless })).toBe(false);
    expect(CARD.noProject).toContain('Make a project first');
  });

  it('will not press with nothing ticked, or before the Mac has been read', () => {
    const dests = destinations({
      found: { user: [{ name: 'a', title: 'A', line: '', scope: 'all', path: '/h/a.md' }], project: [] },
      folders: [], products, project: 'agentbox',
    });
    expect(canBring({ read: false, picked: ['/h/a.md'], dests })).toBe(false);
    expect(canBring({ read: true, picked: [], dests })).toBe(false);
    expect(canBring({ read: true, picked: ['/h/a.md'], dests })).toBe(true);
  });
});

describe('what it says afterwards is what really happened', () => {
  it('counts the rows it really filed', () => {
    expect(importedLine({ added: 3, already: 0, name: NAME }))
      .toBe(`Three rows are in your ${NAME} inbox.`);
    expect(importedLine({ added: 1, already: 0, name: NAME }))
      .toBe(`One row is in your ${NAME} inbox.`);
  });

  it('never reports an import for an agent that already had a row', () => {
    expect(importedLine({ added: 0, already: 4, name: NAME }))
      .toBe(`Four of them already have rows in ${NAME}.`);
    expect(importedLine({ added: 0, already: 1, name: NAME }))
      .toBe(`That agent already has a row in ${NAME}.`);
  });

  it('says both halves when the press did some of each', () => {
    expect(importedLine({ added: 2, already: 1, name: NAME }))
      .toBe(`Two rows are in your ${NAME} inbox. One already had one.`);
  });

  it('is honest about a press with nothing ticked', () => {
    expect(importedLine({ added: 0, already: 0, name: NAME }))
      .toBe('Nothing was ticked, so nothing was filed.');
  });

  it('carries `already` back over the bridge, which the walk never needed', () => {
    expect(api).toContain('already: Number(r?.already ?? 0)');
  });
});

describe('the card offers no key and no button it cannot honour', () => {
  it('draws the button only when there is something to bring', () => {
    // One screen since w-db6f5e331e, so one condition: read, and something on it.
    expect(card).toContain('{read && some && (\n          <div className="ia-foot ia-foot-one">');
  });

  it('takes ⌘↵ and Escape, and leaves plain Enter to the ticks', () => {
    const keys = card.slice(card.indexOf('⌘↵ ADDS WHAT IS TICKED'), card.indexOf('THE TICK, AND IT IS NOT A FORM CONTROL'));
    expect(keys).toContain("e.key === 'Escape'");
    expect(keys).toContain("e.key === 'Enter' && (e.metaKey || e.ctrlKey)");
  });

  it('says where it looked when the Mac has none, rather than drawing nothing', () => {
    // The headline is the answer now, and the two lines under it are where
    // Agentbox looked and how to come back. `CARD.none` was the old block heading
    // and is deleted: it said what the headline one line above it now says.
    expect(CARD.headNone).toBe('No agents to bring across yet.');
    expect(CARD.noneWhere(SECTION.homeFolder)).toContain('~/.claude/agents');
    expect(CARD.noneLater).toBe('When you have some, press ⌘K and type import.');
    expect(card).toContain('CARD.headNone');
    expect(card).toContain('CARD.noneWhere(SECTION.homeFolder)');
    expect(card).toContain('CARD.noneLater');
  });

  it('lets her look again from the empty card, and takes both halves of the read', () => {
    const at = card.indexOf('const lookAgain');
    expect(at).toBeGreaterThan(-1);
    const look = card.slice(at, at + 700);
    expect(look).toContain('api.agentFiles(');
    expect(look).toContain('api.agentFolders()');
    expect(card).toContain('className="ia-look-again"');
  });
});
