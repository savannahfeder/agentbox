// A TEAMMATE'S COMMENT ON A THREAD YOU CLOSED IS NEWS YOU CAN PUT AWAY (2026-11-11).
//
// A tester on a two-person team closed her own thread, "Bookings list empty
// states". Her teammate commented on it afterwards. The thread then sat at the
// top of Needs you with status DONE, three times in one day: opening it showed
// Reopen and the agent saying it was closed, with the comment beneath, and
// going back left it where it was. "This makes the Needs you count hard to
// trust." Measured on the branch: the first line of `belongsInInbox` and its
// copy in App.tsx put any row with a waiting comment in Needs you, and only a
// reply, a close, Later or a schedule of the owner's cleared it. Nothing
// about having read it did.
//
// Now a comment on a closed thread waits only until you open the thread after
// it, as followed-thread news and file news do; E still clears it; a later
// comment brings it back once more. On a thread still open, a comment waits
// until you deal with it, as before.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { belongsInInbox, commentsWaitOnYou } from '../renderer/src/list-rules.ts';
import { ThreadCells } from '../renderer/src/threads/Pages.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const THEO = 'u-theo';
let store, dir, id, clock;
const row = () => store.readItem('web', id);
const theoSays = (n, text) => {
  clock += 60_000;
  disk.appendForeignLines(dir, [{ id, ts: clock, source: 'system', by: THEO, uid: `comment-${n}`, patch: { comment: { text, name: 'Theo' } } }]);
  return clock;
};

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'closed-comment-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'web');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'web', name: 'Web' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  id = store.composeItem('web', { title: 'Bookings list empty states', body: 'Draw the empty states.' }).id;
  disk.updateWorkItem(dir, id, { result: 'Done: three empty states.' }, { source: 'agent' });
  store.answerItem('web', id, { status: 'done' });
  clock = Date.now() + 1000;
});

describe('a comment on a thread you closed', () => {
  it('puts it in Needs you when it arrives (the reported case)', () => {
    theoSays(1, 'Check the mobile one');
    expect(row().status).toBe('done');
    expect(belongsInInbox(row())).toBe(true);
  });

  it('leaves Needs you once you open the thread after it', () => {
    const at = theoSays(1, 'Check the mobile one');
    expect(belongsInInbox(row(), { seen: at + 5_000 })).toBe(false);
  });

  it('stays while you have only opened the thread before it came, and goes at the moment it came', () => {
    const at = theoSays(1, 'Check the mobile one');
    expect(belongsInInbox(row(), { seen: at - 1 })).toBe(true);
    expect(belongsInInbox(row(), { seen: at })).toBe(false);
  });

  it('leaves Needs you on E, which closes it again', () => {
    theoSays(1, 'Check the mobile one');
    store.answerItem('web', id, { status: 'done' });
    expect(row().waitingComments).toBeUndefined();
    expect(belongsInInbox(row())).toBe(false);
  });

  it('comes back once more with a later comment, after you opened it or pressed E', () => {
    const first = theoSays(1, 'Check the mobile one');
    const seen = first + 5_000;
    clock = seen;
    theoSays(2, 'And the tablet one');
    expect(belongsInInbox(row(), { seen })).toBe(true);
    store.answerItem('web', id, { status: 'done' });
    theoSays(3, 'Never mind, both fine');
    expect(belongsInInbox(row(), { seen: clock - 1 })).toBe(true);
  });
});

describe('what must not change', () => {
  it('a closed thread with no comment stays out of Needs you', () => {
    expect(belongsInInbox(row())).toBe(false);
    expect(commentsWaitOnYou(row())).toBe(false);
  });

  it('a comment on a thread still open waits however recently you opened it', () => {
    store.answerItem('web', id, { status: 'open' });
    const at = theoSays(1, 'Can you do the tablet too?');
    expect(belongsInInbox(row(), { seen: at + 60_000 })).toBe(true);
    expect(commentsWaitOnYou(row(), at + 60_000)).toBe(true);
  });
});

describe('the row', () => {
  const team = { state: { signedIn: true }, me: 'u-me', byId: new Map([[THEO, { id: THEO, name: 'Theo Park' }], ['u-me', { id: 'u-me', name: 'Sam Lee' }]]), products: new Map() };
  const draw = (item) => renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team },
    React.createElement(ThreadCells, { item: { ...item, product: 'web' }, product: { slug: 'web', name: 'Web' }, now: clock, tab: 'inbox' })));

  it('on a closed thread reads as news: the comment, not Waiting on you', () => {
    theoSays(1, 'Check the mobile one');
    const html = draw(row());
    expect(html).toContain('Theo commented: Check the mobile one');
    expect(html).not.toContain('Waiting on you');
  });

  it('on an open thread still says Waiting on you', () => {
    store.answerItem('web', id, { status: 'open' });
    theoSays(1, 'Can you do the tablet too?');
    expect(draw(row())).toContain('Waiting on you');
  });
});

describe('the window', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('lets opening a closed thread settle its comments, by the same seen mark as a closed chat', () => {
    expect(app).toContain('if (commentsWaitOnYou(i, seenAt[i.id] ?? unreadSince)) return true;');
    expect(app).not.toContain('if (i.waitingComments?.length) return true;');
  });
});
