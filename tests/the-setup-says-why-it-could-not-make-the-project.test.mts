// SUBMIT WOULD NOT MOVE ANYTHING, AND THE APP KNEW WHY THE WHOLE TIME.
//
// Nothing was stuck. The press reached `createProduct`, the store refused
// because the account already had a project of that name, App.tsx caught the
// refusal and put it in a toast, and `.toast` was z-index 60 under a
// `.fr-screen` that is z-index 300 with an opaque background. So the sentence
// explaining it was drawn underneath the screen it was about. Reproduced
// against a real store: `zero:create-product` answered "product ... already
// exists" and the walk did not move a pixel.
//
// FIFTY-NINE TESTS COVERED THIS WALK AND NONE OF THEM CAUGHT IT, which is worth
// more than the bug. Every one of them drove the state machine with the events
// of a run that WORKS: `advance(s, { t: 'made', product })` says the project
// was made. There was no test anywhere for the store saying no, because until
// somebody walked it on a Mac that already had that project there was no
// obvious reason the store ever would.
//
// There is one, and it is not exotic. ⌘K's "Walk through onboarding again"
// (`walkAgain`) sets the run directly and never consults `firstRunNeeded`, so
// walking it a second time is a walk over a FULL store, and the folder anybody
// points at second time round is one they already made a project for. That is
// the normal case for anybody testing their own onboarding.
//
// So this file holds three things shut:
//   1. the store really does refuse, and this is the sentence it refuses with
//   2. that sentence becomes one she can act on, never a mystery
//   3. NOTHING the app has to say can be painted under the setup screens again
// (The old walk's name card that drew it is gone, 2026-11-21; a project made
// from New project says it in the toast.)

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../main/store.mts';
import { COPY, firstRunNeeded, whyNotMade } from '../renderer/src/onboarding.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

async function store() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-secondwalk-'));
  const accountRoot = path.join(dir, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
  return new Store({ storeRoot: dir, accountId: 'test-account', accountRoot, products: [] }).init();
}

describe('a second walk over a store that already has that project', () => {
  it('is a real state: walking again does not wait for an empty store', () => {
    // This is what makes the collision ordinary rather than exotic. If this
    // ever becomes false, the rest of this file is about a case nobody hits.
    const app = read('renderer/src/App.tsx');
    const walkAgain = app.slice(app.indexOf('const walkAgain'), app.indexOf('\n  }, [', app.indexOf('const walkAgain')));
    expect(walkAgain).toContain('restartFirstRun');
    expect(walkAgain).toContain('setFresh(true)');
    expect(walkAgain).not.toContain('firstRunNeeded');
    // And the automatic path, which is the one that DOES wait, still does.
    expect(firstRunNeeded({ products: 20, done: false })).toBe(false);
    expect(firstRunNeeded({ products: 0, done: false })).toBe(true);
  });

  it('the store refuses the second one, in the words the walk has to handle', async () => {
    const s = await store();
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-cascade-'));
    expect(s.createProduct({ name: 'Cascade', repoPath: folder }).slug).toBe('cascade');

    // The exact throw the real store produced. Same words, same shape.
    expect(() => s.createProduct({ name: 'Cascade', repoPath: folder }))
      .toThrow(/product cascade already exists/);
    // And the same name typed differently is the same slug, so this is not a
    // trick of capitals: it is the folder she would pick either way.
    expect(() => s.createProduct({ name: 'cascade', repoPath: folder }))
      .toThrow(/already exists/);
  });

  it('leaves nothing half made behind when it refuses', async () => {
    const s = await store();
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-half-'));
    s.createProduct({ name: 'Cascade', repoPath: folder });
    const before = fs.readdirSync(s.config.accountRoot).sort();
    try { s.createProduct({ name: 'Cascade', repoPath: folder }); } catch { /* expected */ }
    expect(fs.readdirSync(s.config.accountRoot).sort()).toEqual(before);
  });
});

describe('what the screen says when it will not go on', () => {
  it('names the project she already has, and tells her what to do about it', () => {
    const said = whyNotMade('product cascade already exists', 'Cascade');
    expect(said).toBe(COPY.takenName('Cascade'));
    expect(said).toContain('Cascade');
    // The way out is the half that matters. A sentence that only names the
    // problem leaves her exactly as stuck as the silence did.
    expect(said).toMatch(/another name/i);
  });

  it('reads the same through Electron, which wraps every throw in its own words', () => {
    const raw = "Error invoking remote method 'zero:create-product': Error: product cascade already exists";
    expect(whyNotMade(raw, 'Cascade')).toBe(COPY.takenName('Cascade'));
  });

  it('says what a nameless name is, rather than doing nothing', () => {
    expect(whyNotMade('a product needs a name', '...')).toBe(COPY.emptyName);
  });

  it('never answers with a mystery, whatever the store said', () => {
    for (const message of ['EACCES: permission denied, mkdir', '', undefined, null, 'boom']) {
      const said = whyNotMade(message, 'Side Quest');
      expect(said.length).toBeGreaterThan(20);
      expect(said).not.toMatch(/undefined|null|\[object/i);
      expect(said.trim()).toBe(said);
      expect(said).toMatch(/[.!?]$/);
    }
    // An unknown failure keeps the store's own words rather than replacing them
    // with a better-sounding sentence that says less.
    expect(whyNotMade('EACCES: permission denied, mkdir', 'Side Quest'))
      .toContain('EACCES: permission denied, mkdir');
    // And Electron's plumbing is not read out to her.
    expect(whyNotMade("Error invoking remote method 'zero:create-product': Error: disk is full", 'X'))
      .not.toMatch(/invoking remote method/);
  });
});

describe('nothing the app says may be painted under the walk', () => {
  const css = read('renderer/src/styles.css');
  const zOf = (selector) => {
    const at = css.indexOf(`\n${selector} {`);
    expect(at, `${selector} has no rule`).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('}', at));
    const found = block.match(/z-index:\s*(\d+)/);
    expect(found, `${selector} sets no z-index`).toBeTruthy();
    return Number(found[1]);
  };

  it('the toast sits above the setup screens', () => {
    // This is the whole defect in one line. `.fr-screen` covers the window and
    // is opaque; a toast under it is a message sent nowhere.
    expect(zOf('.toast')).toBeGreaterThan(zOf('.fr-screen'));
  });

  it('and above everything the walk itself draws', () => {
    const walkLayers = [...css.matchAll(/\n(\.fr-[a-z-]+) \{[^}]*z-index:\s*(\d+)/g)]
      .map((m) => ({ selector: m[1], z: Number(m[2]) }));
    expect(walkLayers.length).toBeGreaterThan(0);
    for (const layer of walkLayers) {
      expect(zOf('.toast'), `${layer.selector} would cover the toast`).toBeGreaterThan(layer.z);
    }
  });

  it('the not-made line has a colour of its own, so it is not the faint one', () => {
    expect(css).toMatch(/\.fr-notmade \{[^}]*color:/);
  });
});
