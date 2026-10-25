// A THREAD ANOTHER AGENT HOLDS SAYS WORKING (w-ae746145fc).
//
// Reported from the In progress tab: eleven rows read WORKING beside a cloud or
// a half-dot, and one read IN PROGRESS with a blank where the mark goes. "I'm
// not sure I understand what in progress means compared to the others." That
// row was a thread whose claim was held by an agent this window did not start
// (a terminal session, another computer), so the Status cell fell back to the
// tab's own name. Drawn from the branch before the change, the same thread said
// three things at once: IN PROGRESS in the list, "In progress" beside a ring in
// the side panel, and "Nothing running" at the foot of the conversation.
//
// A first fix said "Working elsewhere" beside a grey half-dot, and read as vague:
// "shouldn't it just say working?" So it says Working, with the mark a run of
// ours wears, and where it runs is in the hover.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { statusCell } from '../renderer/src/status-word.ts';
import { liveLine, shortWord } from '../renderer/src/live-line.ts';
import { bylineFacts, stateLedParts } from '../renderer/src/byline.ts';
import { Live } from '../renderer/src/components/Live.tsx';
import { ThreadCells, LiveContext, CloudContext } from '../renderer/src/threads/Pages.tsx';
import { FleetContext } from '../renderer/src/fleet.ts';
import { Supervisor } from '../main/supervisor.mjs';
import { Store } from '../main/store.mjs';

const NOW = Date.parse('2026-10-21T21:00:00Z');
const MIN = 60_000;

const item = (over = {}) => ({
  id: 'w-1', product: 'personal', productName: 'Personal',
  status: 'open', title: 'Passport renewal reminder', kind: 'directive',
  labels: ['founder'], priority: 4, epoch: 1, claim: null,
  createdAt: NOW - 8 * MIN, updatedAt: NOW - 8 * MIN,
  ...over,
});
const held = (over = {}) => item({ status: 'claimed', claim: { holder: 'mcp-41822', leaseUntil: NOW + 4 * MIN }, ...over });
const inProgress = (over = {}) => ({ inProgress: true, queued: [], now: NOW, ...over });

describe('the Status cell on a thread another agent holds', () => {
  it('says Working, not the tab name', () => {
    const status = statusCell(held(), inProgress());
    expect(status.word).toBe('Working');
    expect(status.word).not.toBe('In progress');
  });

  it('wears the running mark, turning, like a run of ours', () => {
    const status = statusCell(held(), inProgress());
    expect(status.agent).toBe(true);
    expect(status.mark).toBe('working');
    expect(status.live).toBe(true);
    expect(status.cloud).toBe(false);
  });

  it('says where it runs in the hover', () => {
    expect(statusCell(held(), inProgress()).title).toMatch(/outside this window/);
  });

  it('wears the cloud when a cloud run holds it', () => {
    const status = statusCell(held({ claim: { holder: 'mcp-cloud-5e0c-c2', leaseUntil: NOW + 4 * MIN } }), inProgress());
    expect(status.word).toBe('Working');
    expect(status.cloud).toBe(true);
  });

  it('says Working where the agent on it is one of ours', () => {
    const status = statusCell(held(), inProgress({ session: { itemId: 'w-1', product: 'personal', startedAt: NOW - 2 * MIN, tail: [] } }));
    expect(status.word).toBe('Working');
    expect(status.live).toBe(true);
  });

  it('says Nothing running once the claim has run out', () => {
    expect(statusCell(held({ claimExpired: true }), inProgress()).word).toBe('Nothing running');
  });

  it('says Nothing running on an unclaimed thread nothing is queued for', () => {
    expect(statusCell(item(), inProgress()).word).toBe('Nothing running');
  });

  // Paused stops this app's agents; it does not stop one somewhere else.
  it('still says Working while agents here are paused', () => {
    expect(statusCell(held(), inProgress({ paused: true })).word).toBe('Working');
  });

  // The app owes it a ship, so the agent's work is done and any claim left on
  // it is a leftover, not an agent.
  it('says Shipping while the app owes it a ship', () => {
    expect(statusCell(held(), inProgress({ shipping: true })).word).toBe('Shipping');
  });

  // Our own session, open between Remote Control turns, holds the claim too.
  // It is waiting for a turn, so it is neither working nor nothing running.
  it('does not call our own Remote Control session working or idle', () => {
    const status = statusCell(held(), inProgress({ remoteHeld: true }));
    expect(status.word).not.toBe('Working');
    expect(status.word).not.toBe('Nothing running');
  });
});

describe('what the app tells the window', () => {
  let tmp; let sup;
  beforeEach(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'held-elsewhere-')));
    const root = path.join(tmp, 'store');
    fs.mkdirSync(path.join(root, 'p'), { recursive: true });
    fs.writeFileSync(path.join(root, 'p', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'p', name: 'P', repoPath: null }));
    const store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }).init();
    sup = new Supervisor({ storeRoot: root, home: tmp, maxConcurrentSessions: 3 }, store, tmp);
  });
  afterEach(() => {
    sup?.stop?.();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('names the threads it holds open for Remote Control, which running leaves out', () => {
    sup.sessions.set('w-remote', { itemId: 'w-remote', product: 'p', startedAt: NOW, tail: [], remoteIdle: true });
    sup.sessions.set('w-busy', { itemId: 'w-busy', product: 'p', startedAt: NOW, tail: [] });
    const status = sup.status();
    expect(status.remoteHeld).toEqual(['w-remote']);
    expect(status.running.map((r) => r.itemId)).toEqual(['w-busy']);
  });
});

describe('the thread says the same as its row', () => {
  it('says Working at the foot of the conversation, not Nothing running', () => {
    const live = liveLine(held(), inProgress());
    expect(live.state).toBe('elsewhere');
    expect(shortWord(live.state)).toBe('Working');
  });

  it('with the moving mark, and no steps it cannot see', () => {
    const html = renderToStaticMarkup(React.createElement(Live, { item: held(), facts: inProgress() }));
    expect(html).toContain('Working');
    expect(html).toContain('live-mark');
    expect(html).not.toContain('is-still');
    expect(html).not.toContain('live-disclosure');
  });

  it('and in the line under the title, said once', () => {
    const f = bylineFacts(held(), inProgress());
    expect(f.stateWord).toBe('Working');
    // The state mark leads that line with the same word, so it comes off the rest.
    expect(stateLedParts(f, null)).not.toContain('Working');
  });

  // Like Nothing running, it says none of ours is on it, which a surface drawn
  // before the app has said what it runs cannot know.
  it('keeps to In progress where the app has not said what it runs yet', () => {
    expect(statusCell(held(), { inProgress: true, now: NOW }).word).toBe('In progress');
  });

  it('and says nothing about it off In progress', () => {
    expect(liveLine(held(), { queued: [], inProgress: false, now: NOW })).toBe(null);
  });
});

describe('the row', () => {
  const draw = (it) => renderToStaticMarkup(
    React.createElement(FleetContext.Provider, { value: { queued: [] } },
      React.createElement(LiveContext.Provider, { value: new Set() },
        React.createElement(CloudContext.Provider, { value: new Set() },
          React.createElement(ThreadCells, { item: it, product: { slug: 'personal', name: 'Personal' }, now: NOW, tab: 'progress' })))));

  it('draws the running mark in the Status cell where there was a blank', () => {
    const cell = draw(held()).split('th-cell-state')[1];
    expect(cell).toContain('s-running live');
    expect(cell).not.toContain('s-none');
    expect(cell).toContain('Working');
  });

  it('draws the cloud for a cloud run', () => {
    const cell = draw(held({ claim: { holder: 'mcp-cloud-5e0c-c2', leaseUntil: NOW + 4 * MIN } })).split('th-cell-state')[1];
    expect(cell).toContain('th-st-cloud');
  });

  // A 14px cloud and a 12px dot: the gap after each makes up the difference,
  // so every word in the column starts on one line. It was 2px off.
  it('starts the word after a cloud where it starts after a dot', () => {
    const pages = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
    expect(pages).toMatch(/\.th-cell-state \.th-st-cloud\s*\{[^}]*margin-right:\s*6px/);
  });
});
