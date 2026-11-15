// THE TIME COLUMN SAYS WHEN YOU LAST WROTE, NOT WHEN AN AGENT LAST DID.
//
// Reported 2026-10-21 (w-21b638d821): "I would expect it to show when the last
// user message was made. I don't find it useful to show me when the last agent
// message was made because the status tells me that." The column read
// `updatedAt`, which every agent note, label and claim moves, so a page of
// running threads all said "just now" and none of them told you which one you
// had just sent.
//
// It now reads `sentAt`: the newest of your opening message, your latest reply
// (a picked option and an approval are replies) and starting a thread from
// Later. Measured off the fold's own record of who wrote each field.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sentAt, sorted, timeHeading, keeps } from '../renderer/src/threads/page-rules.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');

const NOW = Date.UTC(2026, 9, 21, 15);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const you = (ago) => ({ ts: NOW - ago, source: 'founder', by: 'u-1' });
const agent = (ago) => ({ ts: NOW - ago, source: 'agent', by: 'u-1' });

// A thread you sent an hour ago that an agent has been writing on since.
const yours = {
  id: 'yours', product: 'web', priority: 5, status: 'claimed',
  createdAt: NOW - HOUR, updatedAt: NOW - MIN,
  wrote: { title: you(HOUR), body: you(HOUR), status: agent(MIN), note: agent(MIN), label: agent(50 * MIN) },
};

describe('sentAt', () => {
  it('is when you sent it, however much an agent has written since', () => {
    expect(sentAt(yours)).toBe(NOW - HOUR);
  });
  it('moves when you reply', () => {
    expect(sentAt({ ...yours, wrote: { ...yours.wrote, answer: you(5 * MIN) } })).toBe(NOW - 5 * MIN);
  });
  it('a reply older than a rewrite of your own message is not the newest', () => {
    expect(sentAt({ ...yours, wrote: { ...yours.wrote, answer: you(2 * HOUR), body: you(10 * MIN) } })).toBe(NOW - 10 * MIN);
  });
  it('moves when you start a thread from Later', () => {
    const started = { ...yours, start: 'now', wrote: { ...yours.wrote, start: you(3 * MIN) } };
    expect(sentAt(started)).toBe(NOW - 3 * MIN);
  });
  it('does not move when you put a thread in Later, which is not sending anything', () => {
    const held = { ...yours, start: 'later', wrote: { ...yours.wrote, start: you(3 * MIN) } };
    expect(sentAt(held)).toBe(NOW - HOUR);
  });
  it('does not move for anything you set that is not a message: priority, a pin, a status', () => {
    const fiddled = { ...yours, wrote: { ...yours.wrote, priority: you(MIN), status: you(MIN), pinned: you(MIN) } };
    expect(sentAt(fiddled)).toBe(NOW - HOUR);
  });
  it('a thread an agent filed reads when it was filed, until you answer it', () => {
    const filed = { id: 'filed', status: 'open', createdAt: NOW - DAY, updatedAt: NOW - MIN, wrote: { body: agent(DAY), note: agent(MIN) } };
    expect(sentAt(filed)).toBe(NOW - DAY);
    expect(sentAt({ ...filed, wrote: { ...filed.wrote, answer: you(2 * MIN) } })).toBe(NOW - 2 * MIN);
  });
  it('a teammate’s message counts: it was a person who wrote it', () => {
    const theirs = { id: 'msg', createdAt: NOW - DAY, updatedAt: NOW - MIN, wrote: { answer: { ts: NOW - 20 * MIN, source: 'founder', by: 'u-2' } } };
    expect(sentAt(theirs)).toBe(NOW - 20 * MIN);
  });
  it('a row with no record of who wrote what (a teammate’s card) reads when it last changed', () => {
    expect(sentAt({ id: 'card', updatedAt: NOW - 7 * MIN })).toBe(NOW - 7 * MIN);
  });
});

describe('the column', () => {
  it('is headed Sent wherever it shows this', () => {
    for (const tab of ['inbox', 'progress', undefined]) expect(timeHeading(tab)).toBe('Sent');
  });
  it('and keeps Done and Back where it shows something else', () => {
    expect(timeHeading('done')).toBe('Done');
    expect(timeHeading('snoozed')).toBe('Back');
  });
  it('the table row draws sentAt, not updatedAt', () => {
    const cells = src('threads', 'Pages.tsx');
    expect(cells).toMatch(/tab === 'done' \? finishedAt\(item\) : sentAt\(item\)/);
  });
});

describe('the Display menu’s Sent sort and filter read the same time', () => {
  const display = { view: 'list', sort: 'updated', priorities: [], projects: [], updated: 'any' };
  // Sent an hour ago and busy since, against sent ten minutes ago and quiet.
  const quiet = { id: 'quiet', product: 'web', priority: 5, createdAt: NOW - 10 * MIN, updatedAt: NOW - 10 * MIN, wrote: { body: you(10 * MIN) } };
  it('sorts by when you wrote, so the busy older thread does not jump ahead', () => {
    expect(sorted([yours, quiet], display, 'inbox').map((r) => r.id)).toEqual(['quiet', 'yours']);
  });
  it('Today keeps what you wrote today and drops what an agent touched today', () => {
    const old = { ...yours, createdAt: NOW - 3 * DAY, wrote: { ...yours.wrote, body: you(3 * DAY) } };
    const today = { ...display, updated: 'today' };
    expect(keeps(yours, today, NOW)).toBe(true);
    expect(keeps(old, today, NOW)).toBe(false);
  });
  it('the menu calls both Sent', () => {
    const menu = src('threads', 'Pages.tsx');
    expect(menu).toMatch(/onClick=\{\(\) => set\(\{ sort: 'updated' \}\)\}>Sent</);
    expect(menu).toMatch(/<span className="lab">Sent<\/span>/);
    expect(menu).not.toMatch(/>Updated</);
  });
});
