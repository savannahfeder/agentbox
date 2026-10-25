// THE SHIP TOOK AWAY THE OPTIONS THAT CAME AFTER IT (w-639fc3b3a5).
//
// Reported 2026-10-23 with a screenshot: a finished run ended on "## Options",
// three numbered next steps about deploying the rewritten pages, and the
// thread drew them as plain text with no picker. The person copied option 1
// into the reply box by hand.
//
// The row's ledger showed why. The run ended with the `ship` label on, wrote
// its result with the offer, and 74 seconds later the app's ship queue wrote
// its note, "Shipped to main as a425a2d1.". `offerIsLive` reads any newer
// message without options as the offer having been acted on (that rule came
// from w-1df18b337a, where the offer WAS "let it ship, or change it first?").
// A run that ships always ends this way, so the note always comes last.
//
// Measured on the project's store the same day: 188 rows had options in their
// result, and 123 of them, unanswered, had lost the picker to that note, most
// of them the "Close this task" the message rules ask for after a ship.
//
// So the app's own shipped note spends only an offer that asked about the
// ship. Every other newer message spends an offer as before.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { itemOptions, offerIsLive } from '../renderer/src/format';

const offer = (...options) => ['## Options', ...options.map((o, i) => `${i + 1}. ${o}`)].join('\n');

const SCREENSHOT = offer(
  'Run this on the Mac and deploy the rewritten pages with the new headings (recommended)',
  'Read the full heading list on all six pages before anything ships',
  'Rewrite the tools page the same way first, then deploy everything together',
);

const NOW = 1_792_722_588_007;
let root, store, dir;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-keeps-offer-'));
  dir = path.join(root, 'p');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name: 'Example' }));
  store = await new Store({ accountRoot: root, products: [] }).init();
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

// The run writes its offer, then the ship queue lands its note 74s later.
function shippedAfter(result, sha = 'a425a2d1') {
  const item = store.composeItem('p', { title: 'Discoverability in search and AI' });
  vi.setSystemTime(NOW + 1);
  store.modules.workItemsDisk.updateWorkItem(dir, item.id, { result, labels: ['ship'] }, { source: 'agent' });
  vi.setSystemTime(NOW + 74_000);
  store.shipped('p', item.id, { sha, labels: [] });
  return store.readItem('p', item.id);
}

describe('the app shipping a run does not answer what the run asked next', () => {
  it('the screenshot: next steps after a ship stay pickable', () => {
    const row = shippedAfter(`The page changes are staged.\n\n${SCREENSHOT}`);
    expect(row.note).toBe('Shipped to main as a425a2d1.');
    expect(offerIsLive(row)).toBe(true);
    expect(itemOptions(row).map((o) => o.n)).toEqual([1, 2, 3]);
  });

  it('"Close this task" after a ship stays pickable', () => {
    expect(offerIsLive(shippedAfter(`Queued to ship.\n\n${offer('Close this task')}`))).toBe(true);
  });

  it('holds for the note without a sha', () => {
    expect(offerIsLive(shippedAfter(`Queued.\n\n${offer('Close this task')}`, null))).toBe(true);
  });

  it('options that only mention shipping in passing stay pickable', () => {
    for (const o of [
      'Put the deleted test back as a stub and ship that too',
      'Undo it, revert both commits on the branch and re-ship',
      'Batch the waiting ships next, so third in line does not wait',
      'Restart Agentbox after it merges (recommended)',
      'Yes, merge the five copies of the API-key rule into one, as its own task',
    ]) expect(offerIsLive(shippedAfter(`Done.\n\n${offer('Close this task', o)}`)), o).toBe(true);
  });
});

describe('an offer that asked whether to ship is answered by the ship', () => {
  it('w-1df18b337a: "let it ship, or change it first?" goes once it has shipped', () => {
    const row = shippedAfter(`Re-queued to ship.\n\n${offer('Let it ship as built (recommended)', 'Change the chip first')}`);
    expect(offerIsLive(row)).toBe(false);
  });

  it('every way the store has seen it asked', () => {
    for (const o of [
      'Ship it (recommended)',
      '**Ship it**',
      'Ship the count fix (recommended)',
      'Ship it: deploy the server change, then test from the phone',
      'Let the re-queued ship run (recommended)',
      'Not now, just ship this',
      'Merge it',
    ]) expect(offerIsLive(shippedAfter(`Ready.\n\n${offer(o, 'Hold it on the branch')}`)), o).toBe(false);
  });
});

describe('every other newer message still spends an offer', () => {
  it('an agent checkpoint after the offer', () => {
    const item = store.composeItem('p', { title: 'A task' });
    vi.setSystemTime(NOW + 1);
    store.modules.workItemsDisk.updateWorkItem(dir, item.id, { result: `Built it.\n\n${SCREENSHOT}` }, { source: 'agent' });
    vi.setSystemTime(NOW + 2);
    store.modules.workItemsDisk.updateWorkItem(dir, item.id, { note: 'Deployed the pages.' }, { source: 'agent' });
    expect(offerIsLive(store.readItem('p', item.id))).toBe(false);
  });

  it('a failed ship, which sends the row back to its agent', () => {
    const item = store.composeItem('p', { title: 'A task' });
    vi.setSystemTime(NOW + 1);
    store.modules.workItemsDisk.updateWorkItem(dir, item.id, { result: `Built it.\n\n${offer('Close this task')}` }, { source: 'agent' });
    vi.setSystemTime(NOW + 2);
    store.shipFailed('p', item.id, { note: 'It did not ship, and it went back to its agent: 2 tests failed', labels: [] });
    expect(offerIsLive(store.readItem('p', item.id))).toBe(false);
  });

  it('a note that says it shipped and then says more is an agent talking', () => {
    const row = shippedAfter(`Built it.\n\n${SCREENSHOT}`);
    vi.setSystemTime(NOW + 80_000);
    store.modules.workItemsDisk.updateWorkItem(dir, row.id, { note: 'Shipped to main as a425a2d1. Deployed the pages too.' }, { source: 'agent' });
    expect(offerIsLive(store.readItem('p', row.id))).toBe(false);
  });

  it('a reply from the person after the ship', () => {
    const row = shippedAfter(`Built it.\n\n${SCREENSHOT}`);
    vi.setSystemTime(NOW + 80_000);
    store.modules.workItemsDisk.updateWorkItem(dir, row.id, { answer: 'Do option 1' }, { source: 'founder' });
    expect(offerIsLive(store.readItem('p', row.id))).toBe(false);
  });
});
