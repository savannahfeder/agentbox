// THREE AGENTS ASKING, ONE CARD, AND NO WAY TO REACH THE OTHER TWO (F-85, QA
// sessions 13 and 14, 2026-10-26).
//
// Three threads stopped at a git commit approval at the same time. One card
// was drawn, on every screen, for the oldest of them. Opening either of the
// other two showed the command still "Running ... git commit" with no card and
// no Allow or Deny of its own, so there was nothing to answer and no way to ask
// for it. The tester left all three unanswered and the three agents sat there.
//
// One card at a time stays (renderer/src/approval-stage.ts says why: a queue
// that shuffles forward under your hands is whack-a-mole). What changes is
// WHICH one: the card in front is the open thread's own, and the oldest
// everywhere else -- the inbox, settings, a dialog.
//
// AND THREE THINGS HAVE TO AGREE ABOUT IT, which is why the rule is one shared
// function. The card is drawn in the renderer, but ⌘Y/⌘N is caught in the main
// process ahead of the page, and so is Allow/Deny in the Agents menu. If those
// read the spool's own order while the screen read another, the chord would
// allow a command nobody was looking at -- a worse bug than the one being
// fixed. Asserted against the source the way
// tests/the-menu-answers-a-card-through-the-one-door.test.mts is: the main
// process is not something this suite can boot, and the invariant is
// structural.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardsInFront } from '../shared/which-card-is-in-front.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');

const card = (id, item, product = 'sandbox-1') => ({ id, product, item, tool: 'Bash', input: { command: 'git commit' } });
// The spool's own order: oldest first (main/approvals.mts).
const ASKING = [card('a', 'w-ascii', 'str-utils-py'), card('b', 'w-reverse'), card('c', 'w-is-blank')];
const ids = (list) => list.map((r) => r.id);

describe('the approval card in front', () => {
  it('is the open thread\'s own, however long the others have been waiting', () => {
    expect(ids(cardsInFront(ASKING, { product: 'sandbox-1', id: 'w-is-blank' }))).toEqual(['c', 'a', 'b']);
    expect(ids(cardsInFront(ASKING, { product: 'sandbox-1', id: 'w-reverse' }))).toEqual(['b', 'a', 'c']);
  });

  it('is the oldest in the inbox, where no one thread is open', () => {
    expect(ids(cardsInFront(ASKING, null))).toEqual(['a', 'b', 'c']);
    expect(ids(cardsInFront(ASKING, { product: 'sandbox-1', id: null }))).toEqual(['a', 'b', 'c']);
  });

  it('is the oldest on a thread nothing is asking about', () => {
    // The case that must NOT match. Opening an unrelated thread does not hide
    // the question somebody else is stopped on.
    expect(ids(cardsInFront(ASKING, { product: 'sandbox-1', id: 'w-word-count' }))).toEqual(['a', 'b', 'c']);
  });

  it('is not another project\'s thread that happens to share an id', () => {
    // Item ids are unique within a product's ledger, not across the store.
    expect(ids(cardsInFront(ASKING, { product: 'receipt-cli', id: 'w-reverse' }))).toEqual(['a', 'b', 'c']);
    // A request from before the spool carried a product has the id alone to go on.
    const old = [card('a', 'w-ascii', 'str-utils-py'), { ...card('b', 'w-reverse'), product: null }];
    expect(ids(cardsInFront(old, { product: 'sandbox-1', id: 'w-reverse' }))).toEqual(['b', 'a']);
  });

  it('keeps one thread\'s own cards in the order they were asked', () => {
    // A worker can be stopped on a second question while the first is still up.
    const two = [card('a', 'w-ascii', 'str-utils-py'), card('b', 'w-is-blank'), card('c', 'w-is-blank')];
    expect(ids(cardsInFront(two, { product: 'sandbox-1', id: 'w-is-blank' }))).toEqual(['b', 'c', 'a']);
  });

  it('survives a snapshot with nothing in it', () => {
    expect(cardsInFront([], { product: 'sandbox-1', id: 'w-is-blank' })).toEqual([]);
    expect(cardsInFront(null, null)).toEqual([]);
    expect(cardsInFront(undefined, { product: null, id: 'w-is-blank' })).toEqual([]);
  });
});

describe('the screen, the chord and the Agents menu', () => {
  const ipc = read('main', 'ipc.mts');
  const main = read('main', 'main.mts');

  it('all read the one order, so ⌘Y answers the card being read', () => {
    // The snapshot the card is drawn from.
    expect(ipc).toMatch(/cardsInFront\(approvals\.listPending\(config\.storeRoot\), looking\)/);
    expect(ipc).toMatch(/approvals: sendingApprovals\(\)/);
    expect(ipc).toMatch(/const sendingApprovals = \(\) => \{\n\s*const cards = pendingApprovals\(\);/);
    // And nothing that answers for this screen reaches past it for the spool's
    // own order. Two readings are left and neither is a card in front: the stub
    // that stands in until the IPC surface exists, before which nothing can
    // have been pressed, and the phone, which draws every card as a list of its
    // own and has no thread open on this computer.
    expect(main.match(/approvals\.listPending\(/g)).toHaveLength(2);
    expect(main).toMatch(/let cardInFront(?:: [^\n]*?)? = \(\) => approvals\.listPending\(config\.storeRoot\)\[0\]/);
    expect(main).toMatch(/cardInFront = \(\) => ipc\.pendingApprovals\(\)\[0\]/);
  });

  it('is told which thread is open by the one screen that knows', () => {
    expect(ipc).toMatch(/ipcMain\.handle\('zero:looking'/);
    // And by nothing else: this moves which card ⌘Y answers, so a frame that
    // is not the window's own top one is refused, as `zero:refresh-usage` is.
    const handler = ipc.slice(ipc.indexOf("ipcMain.handle('zero:looking'"), ipc.indexOf("ipcMain.handle('zero:approve'"));
    expect(handler).toMatch(/event\?\.senderFrame\?\.parent \|\| \(event\?\.sender && event\.sender !== window\.webContents\)/);
    expect(read('preload.cjs')).toMatch(/looking: \(payload\) => ipcRenderer\.invoke\('zero:looking', payload\)/);
    expect(read('renderer', 'src', 'App.tsx')).toMatch(/api\.lookingAt\(focused \?/);
  });

  it('answers the chord and the menu through the same card', () => {
    const chord = main.slice(main.indexOf("window.webContents.on('before-input-event'"), main.indexOf('// ---- END OF THE CHORD WIRING ----'));
    expect(chord).toMatch(/const front = cardInFront\(\);/);
    const menu = main.slice(main.indexOf('installMenu({'), main.indexOf('// ANALYTICS'));
    expect(menu).toMatch(/const front = cardInFront\(\);/);
  });
});
