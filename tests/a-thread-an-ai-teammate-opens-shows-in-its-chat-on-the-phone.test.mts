// A THREAD AN AI TEAMMATE OPENS FOR AN AGENT SHOWS IN ITS CHAT ON THE PHONE TOO.
//
// The desktop's chat lists a thread a teammate's run filed for an ordinary
// agent as "Opened", or where it stands now (chat-lines.ts `openedLines`,
// TeammatesPage.tsx `SentCard`). The phone's chat drew only what it sent you,
// under a "Sent you" heading with "Answered" under each line, which the
// desktop no longer draws. Measured on chatRows and the words for a line.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { chatRows, sentWord, tabOfThread, teamFrom } from '../mobile/src/lib/teammates';
import { TEAMMATE_LABEL_PREFIX } from '../shared/teammates.mts';

const NOW = Date.parse('2026-10-30T15:00:00Z');
const DEV = '0a1b2c3d4e5f';
const P = `alpha@${DEV}`;
const mate = (id, more = {}) => ({ id, name: `Mate ${id}`, letter: 'M', role: null, status: 'active', paused: false, primary: false, product: 'alpha', waiting: [], running: null, now: null, ...more });
const copy = (more = {}) => ({ list: [mate('t-a', { primary: true }), mate('t-b')], chat: [{ id: 'm-1', kind: 'msg', from: 'you', to: ['t-a'], text: 'Plan the launch', ts: NOW - 50_000 }], runs: [], ...more });
const on = (teammates) => ({ device: DEV, name: DEV, updated_at: new Date(NOW - 1000).toISOString(), settings: { workspace: { alpha: { teammates: true } }, teammates } });
const run = (id, mateId) => ({ id, product: P, title: 'Its run', labels: [`${TEAMMATE_LABEL_PREFIX}${mateId}`], createdAt: NOW - 30_000 });
const child = (id, parent, ts, more = {}) => ({ id, product: P, title: `Thread ${id}`, parent, labels: [], createdAt: ts, ...more });

describe('a teammate\'s chat on the phone', () => {
  it('lists a thread its run opened for an agent, at the time it was opened', () => {
    const view = teamFrom([on(copy())]).view;
    const rows = chatRows(view, 't-a', [], NOW, [run('r-1', 't-a'), child('w-1', 'r-1', NOW - 20_000)]);
    const sent = rows.filter((r) => r.kind === 'sent');
    expect(sent).toHaveLength(1);
    expect(sent[0].runs).toMatchObject([{ verb: 'opened', item: 'w-1', product: P, title: 'Thread w-1' }]);
  });
  it('threads it sent and opened one after another are one card', () => {
    const runs = [{ id: 'x-1', kind: 'run', teammate: 't-a', item: 'w-0', product: 'alpha', title: 'Sent one', verb: 'sent', ts: NOW - 25_000 }];
    const rows = chatRows(teamFrom([on(copy({ runs }))]).view, 't-a', [], NOW, [run('r-1', 't-a'), child('w-1', 'r-1', NOW - 20_000)]);
    const sent = rows.filter((r) => r.kind === 'sent');
    expect(sent).toHaveLength(1);
    expect(sent[0].runs.map((r) => r.verb)).toEqual(['sent', 'opened']);
  });
  it('leaves out threads another teammate\'s run opened, and teammate threads under its run', () => {
    const items = [run('r-1', 't-b'), child('w-1', 'r-1', NOW - 20_000), run('r-2', 't-a'), child('w-2', 'r-2', NOW - 10_000, { labels: [`${TEAMMATE_LABEL_PREFIX}t-a`] })];
    expect(chatRows(teamFrom([on(copy())]).view, 't-a', [], NOW, items).filter((r) => r.kind === 'sent')).toEqual([]);
  });
});

describe('the words before a thread it sent or opened, as the desktop says them', () => {
  it('say where the thread stands', () => {
    expect(sentWord({ verb: 'sent' }, 'inbox')).toBe('Waiting on you');
    expect(sentWord({ verb: 'sent' }, 'progress')).toBe('In progress');
    expect(sentWord({ verb: 'opened' }, 'done')).toBe('Done');
    expect(sentWord({ verb: 'opened' }, 'snoozed')).toBe('Not started');
  });
  it('fall back to what it did when the thread stands nowhere it names', () => {
    expect(sentWord({ verb: 'sent' }, 'snoozed')).toBe('Sent you');
    expect(sentWord({ verb: 'sent' }, null)).toBe('Sent you');
    expect(sentWord({ verb: 'opened' }, null)).toBe('Opened');
  });
  it('the tab is the list the thread is on now', () => {
    const tabs = { inbox: [{ product: P, id: 'w-1' }], progress: [], snoozed: [{ product: P, id: 'w-2' }], done: [] };
    expect(tabOfThread(tabs, P, 'w-1')).toBe('inbox');
    expect(tabOfThread(tabs, P, 'w-2')).toBe('snoozed');
    expect(tabOfThread(tabs, P, 'w-3')).toBeNull();
    expect(tabOfThread(tabs, `beta@${DEV}`, 'w-1')).toBeNull();
  });
});

describe('the card the phone draws', () => {
  const page = fs.readFileSync('mobile/src/app/teammate/[id].tsx', 'utf8');
  it('says each line\'s word before its title, with no heading and no "Answered" under it', () => {
    expect(page).toContain('sentWord(');
    expect(page).not.toContain('Sent you ·');
    expect(page).not.toContain("'Answered'");
  });
});
