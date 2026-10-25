// A THREAD WHOSE WORK SHIPPED SAYS SHIPPED.
//
// What broke: a thread ended "Done, labelled to ship", sat in Needs you and
// Done reading "Waiting" and "Done", and was closed in the belief that it had
// shipped; it had not (w-21b638d821, 2026-10-21). Nothing on the row or the
// side panel ever said which threads had reached main. Measured on the store:
// the app writes "Shipped to main as <sha>." on every thread it ships, and
// the Status word read "Waiting" over it.
//
// The Status word, in the list and the side panel alike, now says Shipped
// once the app has shipped a thread and nothing has happened on it since.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { statusCell } from '../renderer/src/status-word';
import { Store } from '../main/store.mjs';
import { CLOSED_ANYWAY, shippedAs } from '../shared/not-shipped.mjs';

const app = (ts) => ({ ts, source: 'system' });
const agent = (ts) => ({ ts, source: 'agent' });
const her = (ts) => ({ ts, source: 'founder' });
const row = (over = {}) => ({
  id: 'w-1', product: 'team', title: 'Sort In Progress', kind: 'directive', labels: ['founder'], status: 'blocked',
  result: "**Done, and it's labelled to ship.**", note: 'Shipped to main as 5941bc3.', createdAt: 10, updatedAt: 300,
  ...over,
  wrote: { title: her(10), body: her(10), result: agent(100), note: app(200), ...(over.wrote ?? {}) },
});
const word = (item, facts = {}) => statusCell(item, { queued: [], now: 1000, ...facts });

describe('a thread the app shipped', () => {
  it('says Shipped in Needs you, with the commit on hover', () => {
    expect(word(row())).toMatchObject({ word: 'Shipped', mark: 'done', title: 'Shipped to main as 5941bc3' });
  });

  it('says Shipped in Done too', () => {
    expect(word(row({ status: 'done', wrote: { status: her(250) } })).word).toBe('Shipped');
  });

  it('says Shipped when the app shipped it without naming the commit', () => {
    expect(word(row({ note: 'Shipped to main.' }))).toMatchObject({ word: 'Shipped', title: 'Shipped to main' });
  });
});

describe('it stops saying Shipped', () => {
  it('once the agent has written since, because that is the news now', () => {
    expect(word(row({ wrote: { result: agent(300) } })).word).toBe('Waiting');
  });

  it('once she has replied since, because the thread is moving again', () => {
    expect(word(row({ answer: 'one more thing', wrote: { answer: her(300) } })).word).not.toBe('Shipped');
  });

  it('while an agent is working on it', () => {
    expect(word(row(), { session: { itemId: 'w-1', startedAt: 900, where: 'local' } }).word).not.toBe('Shipped');
  });
});

describe('it never says Shipped', () => {
  it('for an agent saying so in its own words: only the app ships', () => {
    expect(word(row({ wrote: { note: agent(200) } })).word).toBe('Waiting');
  });

  it('for a thread still waiting in the ship queue', () => {
    expect(word(row({ note: undefined, labels: ['founder', 'ship'] }), { shipping: true, inProgress: true }).word).toBe('Shipping');
  });

  it('for a thread with no ship at all', () => {
    expect(word(row({ note: undefined })).word).toBe('Waiting');
    expect(word(row({ note: undefined, status: 'done', wrote: { status: her(250) } })).word).toBe('Done');
  });

  it('for a thread closed after being told its work never reached main, which says so', () => {
    const closed = row({ status: 'done', note: `${CLOSED_ANYWAY} It is still on cloud/w-1.`, wrote: { status: her(250) } });
    expect(word(closed)).toMatchObject({ word: 'Not shipped', mark: 'done' });
  });
});

describe('the side panel', () => {
  it('reads its Status from the same word as the list', () => {
    const summary = fs.readFileSync(new URL('../renderer/src/threads/Summary.tsx', import.meta.url), 'utf8');
    expect(summary).toMatch(/function useStatus\(item: WorkItem\): StatusCell[\s\S]{0,600}statusCell\(item/);
  });
});

describe('what the app writes when it ships', () => {
  let tmp; let store;
  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'says-shipped-'));
    const root = path.join(tmp, 'store');
    fs.mkdirSync(path.join(root, 'team'), { recursive: true });
    fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team' }));
    store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }).init();
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('is read back as shipped, with its commit', () => {
    const made = store.fileItem('team', { title: 'Ship me', kind: 'task', body: 'x' });
    store.modules.workItemsDisk.updateWorkItem(store.productDir('team'), made.id, { result: 'Done, labelled to ship.' }, { source: 'agent', now: Date.now() - 60_000 });
    store.shipped('team', made.id, { sha: 'abc1234', labels: [] });
    expect(shippedAs(store.readItem('team', made.id))).toEqual({ sha: 'abc1234' });
  });
});
