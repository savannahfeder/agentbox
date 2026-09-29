// THE LINE UNDER THE TITLE SAYS WHAT SHE ASKED FOR, AND NOTHING SHE CUT.
//
// Every assertion in this file is one of her sentences. They are here rather
// than in a screenshot because a screenshot cannot fail: the model, the kind
// and the project were each taken off this line by name, and the only thing
// that stops one of them coming back is a test that says so.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bylineFacts, lastChange, whereItIs, WHERE_WORD, engineWordFor } from '../renderer/src/byline.ts';
import { Name } from '../shared/product-name.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/**
 * The code with its prose taken off. Every file in this app carries her own
 *  sentences in its comments, so "the drawing never says Codex" has to be
 *  asked of what is DRAWN and not of the paragraph explaining why. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const byline = read('renderer/src/components/Byline.tsx');
const bylineDrawn = code(byline);
const bylineTs = code(read('renderer/src/byline.ts'));
const focus = read('renderer/src/components/Focus.tsx');
const live = read('renderer/src/components/Live.tsx');
const css = read('renderer/src/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');

const NOW = 1_700_000_000_000;
const M = 60_000;

/** A row as the fold hands it over, with the `wrote` map the fold builds. */
function row(over = {}) {
  return {
    id: 'w-1', status: 'open', title: 'A row', kind: 'directive',
    product: 'agentbox', productName: Name,
    createdAt: NOW - 60 * M, updatedAt: NOW - M,
    wrote: { body: { ts: NOW - 30 * M, source: 'founder' } },
    ...over,
  };
}

const session = (startedAt) => ({ itemId: 'w-1', startedAt, helpers: 0 });

/* -------------------------- what the line may say ------------------------- */

describe('the four facts she cut are not on it', () => {
  // (2026-08-27)
  it('has no model anywhere in the vocabulary or the drawing', () => {
    expect(bylineTs).not.toMatch(/\bmodelOf\b|\bengineModel\b|\bmodelWords\b/);
    expect(bylineDrawn).not.toMatch(/\bmodel\b/i);
    const f = bylineFacts(row(), { now: NOW });
    expect(Object.keys(f)).not.toContain('model');
  });

  // — which is also the answer to "what the heck is a directive". The word
  // simply does not appear.
  it('never prints the ledger kind', () => {
    expect(bylineDrawn).not.toMatch(/item\.kind|f\.kind|rawKind/);
    const f = bylineFacts(row({ kind: 'directive' }), { now: NOW });
    expect(JSON.stringify(f)).not.toMatch(/directive/);
  });

  // Cut 2026-08-28, PUT BACK 2026-09-28 (w-b8c8958a12): "In a task itself I
  // can't see which project it is." First on the line, so the ellipsis on a
  // narrow card takes the clock before it takes the project.
  it('prints the project, first', () => {
    expect(bylineDrawn).toMatch(/parts=\{\[f\.project, f\.whereWord/);
    const f = bylineFacts(row({ productName: 'Powerup' }), { now: NOW });
    expect(f.project).toBe('Powerup');
    expect(f.line.startsWith('Powerup. ')).toBe(true);
  });

  it('says nothing in the project slot when there is no name', () => {
    const f = bylineFacts(row({ productName: '  ' }), { now: NOW });
    expect(f.project).toBeNull();
    expect(f.line).toBe('This is in your inbox, waiting for you.');
  });

  // No harness is marked, ever.
  //
  // AND ON THIS MAC THE SLOT IS EMPTY, which is the state every other assertion
  // in this file is written about: no choice, so no word, so the line she
  // picked on 08-28 is unchanged. The word itself is
  // tests/the-line-under-the-title-names-the-engine.test.mjs.
  it('keeps the coding-agent slot empty here, and marks no harness anywhere', () => {
    expect(engineWordFor()).toBeNull();
    expect(engineWordFor({ engine: 'codex' })).toBeNull();
    expect(bylineFacts(row(), { now: NOW }).engineWord).toBeNull();
    expect(bylineDrawn).not.toMatch(/codex|claude ?code/i);
    expect(css).not.toMatch(/\.by-[a-z-]*codex|\.by-[a-z-]*claude/i);
  });
});

/* ------------------------------ the two clocks ---------------------------- */

describe('the time reading means something', () => {
  it('is the last real change to the row, not the last keep-alive', () => {
    // The heartbeat the MCP server appends every hundred seconds bumps
    // `updatedAt` and sets no field, so it never reaches the `wrote` map. That
    // gap IS the bug she found: 161 of this row's own 215 ledger lines were
    // heartbeats, measured on her store on 2026-08-28.
    const beaten = row({ updatedAt: NOW - M, wrote: { body: { ts: NOW - 30 * M, source: 'founder' } } });
    expect(lastChange(beaten)).toBe(NOW - 30 * M);
    const f = bylineFacts(beaten, { now: NOW, inProgress: false });
    expect(f.age).toBe('30m');
  });

  it('falls back to updatedAt on a row with no wrote map', () => {
    // An imported session or a line older than the map. Nothing ever heartbeat
    // on one of those, so `updatedAt` is not wrong there.
    expect(lastChange({ updatedAt: NOW - 5 * M })).toBe(NOW - 5 * M);
    expect(lastChange({})).toBe(0);
  });

  it('carries one clock while a run is up, and not two', () => {
    const f = bylineFacts(row(), {
      now: NOW, inProgress: true, session: session(NOW - 4 * M),
    });
    expect(f.span).toBe('4m');
    // This is the whole of her question: there is no second reading behind the
    // span for her to have to reconcile with it.
    expect(f.age).toBeNull();
  });

  it('says the reading again the moment the run ends', () => {
    const f = bylineFacts(row(), { now: NOW, inProgress: true });
    expect(f.span).toBeNull();
    expect(f.age).toBe('30m');
  });
});

/* ----------------------------- where the row is --------------------------- */
// (2026-08-27)

describe('it says which list the row is on, in the tab\'s own word', () => {
  it('names all five states', () => {
    expect(whereItIs(row(), { inProgress: true, now: NOW })).toBe('progress');
    expect(whereItIs(row(), { inProgress: false, now: NOW })).toBe('inbox');
    expect(whereItIs(row({ status: 'blocked' }), { now: NOW })).toBe('blocked');
    expect(whereItIs(row({ status: 'done' }), { now: NOW })).toBe('closed');
    expect(whereItIs(row(), { scheduledUntil: NOW + M, now: NOW })).toBe('scheduled');
  });

  it('uses the words on the tabs and no third vocabulary', () => {
    expect(WHERE_WORD.progress).toBe('In progress');
    expect(WHERE_WORD.inbox).toBe('In your inbox');
    const app = read('renderer/src/App.tsx');
    expect(app).toContain('In progress');
  });

  it('says Blocked in that slot rather than on a chip beside it', () => {
    // The old line had no room for the fact, so it was carried by a red chip
    // on the end. Drawing both would be the same word twice.
    const f = bylineFacts(row({ status: 'blocked' }), { now: NOW });
    expect(f.whereWord).toBe('Blocked');
    expect(bylineDrawn).not.toMatch(/chip-blocked/);
    expect(code(focus)).not.toMatch(/chip-blocked/);
  });
});

/* ------------------------------- the mark --------------------------------- */

// The 2026-09-19 selection supersedes the historical double mark above.
describe('the header leaves the animation at the conversation foot', () => {
  it('uses plain status text in the header and keeps the lattice below', () => {
    expect(bylineDrawn).not.toMatch(/LiveMark|is-shimmering/);
    expect(live).toMatch(/<LiveMark still=\{!working\} \/>/);
    expect(focus).toMatch(/<Live item=\{item\}/);
    expect(focus).toMatch(/<Byline\b/);
  });
});

/* ------------------------- one line, not eighteen ------------------------- */
// Her standing rule on option sets: an approval closes them.

describe('there is one line and nothing left to switch', () => {
  it('has no look switch, no stored preference and no query override', () => {
    expect(fs.existsSync(path.join(ROOT, 'renderer/src/byline-look.ts'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'renderer/src/components/byline-icons.tsx'))).toBe(false);
    expect(code(read('renderer/src/App.tsx'))).not.toMatch(/bylineLook|BYLINE_KEY/);
    expect(bylineDrawn).not.toMatch(/\blook\b/);
    expect(css).not.toMatch(/\.by-(today|plain|boxed|tint|bare|ink|leadchips)\b/);
  });
});

/* --------------------------- and it is captioned -------------------------- */

describe('a picture has to be captioned', () => {
  it('hands the whole thing over as one sentence', () => {
    const f = bylineFacts(row(), { now: NOW, inProgress: true, session: session(NOW - 4 * M) });
    expect(f.line).toBe(`${Name}. This is in progress. The agent has been working on this for 4m.`);
    expect(byline).toMatch(/aria-label=\{f\.line\}/);
  });

  it('says the plain thing on a row with nothing on it', () => {
    const f = bylineFacts(row(), { now: NOW, inProgress: false });
    expect(f.line).toBe(`${Name}. This is in your inbox, waiting for you.`);
  });
});
