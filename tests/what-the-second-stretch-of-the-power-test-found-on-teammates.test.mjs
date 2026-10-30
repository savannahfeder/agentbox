// The second stretch of the power test of 2026-10-25, on teammates:
// - "Task sent from New thread to Maintainer never becomes a thread; it's
//   stacked onto its setup job": a new thread to a teammate went into whatever
//   run of its was waiting on you, as if it answered that run's question.
// - "Teammate chat says 'Waiting on you' with no words about what it wants":
//   a run's card showed its title ("Set up its job") and never what it said.
// - "Esc to close the teammate's ⋯ menu threw me out of Chats into Threads":
//   the menu closed, and the same key went on to the app, which left the page.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { planWakes, runLines, teammateLabel, DEFAULT_LIMIT } from '../shared/teammates.mjs';

const NOW = new Date(2026, 9, 26, 9, 30).getTime();
const felix = { id: 't-ffffff', name: 'Felix', letter: 'F', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [] };
const chat = (messages) => ({ messages, seen: new Set() });
const waiting = { id: 'w-222222', product: 'kestrel', title: 'Set up its job', status: 'open', labels: ['founder', teammateLabel(felix.id)], createdAt: NOW - 1000,
  result: '**Should I bring you everything, or only what needs a decision?**\n\nMore words.', wrote: { result: { ts: NOW - 500, source: 'agent' } } };

describe('a new thread to a teammate', () => {
  it('is new work, even with one of its runs waiting on you', () => {
    const m = { id: 'm-n', kind: 'msg', from: 'you', to: [felix.id], text: 'Add pagination to the orders page', fresh: true, ts: NOW };
    const acts = planWakes({ teammates: [felix], chat: chat([m]), items: [waiting], now: NOW });
    expect(acts.find((a) => a.type === 'answer')).toBeUndefined();
    expect(acts.find((a) => a.type === 'run')).toMatchObject({ teammate: felix.id });
  });

  it('while a message in its chat still answers the run waiting on you', () => {
    const m = { id: 'm-c', kind: 'msg', from: 'you', to: [felix.id], text: 'Only decisions', ts: NOW };
    expect(planWakes({ teammates: [felix], chat: chat([m]), items: [waiting], now: NOW })).toContainEqual(expect.objectContaining({ type: 'answer', item: waiting.id }));
  });

  it('is sent from the New thread box as fresh, and the store keeps that', () => {
    expect(fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8')).toMatch(/\{ text, to: \[to\], fresh: true \}/);
    expect(fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8')).toMatch(/mates\.post\(\{ text: a\.text, to: a\.to, fresh: a\.fresh === true[,}]/);
  });
});

describe('what a teammate sent you, in its chat', () => {
  it('carries the first thing it said, without its markdown', () => {
    const sent = runLines([waiting], [felix]).find((l) => l.verb === 'sent');
    expect(sent.said).toBe('Should I bring you everything, or only what needs a decision?');
  });

  // Since 2026-10-26 it is the thread's inbox row, which leads with the same
  // first line (rowTitle); without the thread loaded the row uses `said`.
  it('is shown on its row, and its title only when it said nothing', () => {
    const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/<RowCells title=\{r\.said \|\| r\.title\}/);
  });
});

describe('the teammate ⋯ menu', () => {
  it('keeps the Escape that closes it from reaching the page behind', () => {
    const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
    const menu = page.slice(page.indexOf('export function TeammateMenu('), page.indexOf('export function TeammatesPage('));
    expect(menu).toMatch(/if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); setOpen\(false\); \}/);
  });
});
