// THE THREAD'S TOP BAR SAYS ITS STATE ONCE, AND KEEPS ITS VERBS IN ONE MENU.
//
// What she saw on an opened thread in the team build (w-e731ca9376, 2026-10-01),
// photographed in the real renderer at 1440 by 900 before this change:
//
//   - The line under the title read "Working 1m · AGENTBOX · IN PROGRESS ·
//     CLAUDE CODE". The first word was in sentence case and everything after
//     it in uppercase mono, and the state was said three times on one bar:
//     "Working" on the left, "IN PROGRESS" beside it, and "Running" with its
//     half filled mark at the right.
//   - The right side held five things: the terminal mark at 1091..1125, the
//     state word, the Summary button at 1219..1340, the Done mark at
//     1364..1398, and "+873 −41 in 7 files" hanging under them.
//   - The back chevron's ink top sat 1.6 points under the top of the title's
//     capitals, which read as a chevron a couple of pixels too low.
//
// What she asked for, and what this holds:
//
//   1. The state leads the line under the title, as the mark she liked plus
//      one of the app's four words, in the same uppercase mono as the rest:
//      "RUNNING 1M · AGENTBOX · CLAUDE CODE". Anything else on the line that
//      says the state again comes off; anything that says something the state
//      word does not (Blocked, Queued, Paused, Nothing came back, a count of
//      subagents) stays.
//   2. The right side is the Summary button and one square three-dot button.
//      The dots open a small menu: View code changes (with the figures as its
//      detail, and only when the run changed code), Open terminal (⌘J), Mark
//      done (E). A conversation with a person has no code and no terminal, so
//      its menu is Mark done alone; with nothing left, no dots are drawn.
//   3. The chevron is raised one point, which puts its ink top 0.6 under the
//      capitals' top and its centre 0.55 over theirs (from 1.6 and -0.45).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { bylineFacts, stateLedParts } from '../renderer/src/byline.ts';
import { Byline } from '../renderer/src/components/Byline.tsx';
import { ThreadStateMark, SummaryToggle } from '../renderer/src/threads/Summary.tsx';
import * as summaryModule from '../renderer/src/threads/Summary.tsx';
import { threadMenuRows, ThreadMenu, ThreadMenuList } from '../renderer/src/threads/ThreadMenu.tsx';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const prose = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const draw = (el) => renderToStaticMarkup(el);
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const said = (parts) => parts.filter(Boolean).join(' · ');

const NOW = Date.now();
const M = 60_000;
const row = (o = {}) => ({
  id: 'w-1', product: 'agentbox', productName: 'Agentbox', status: 'open', title: 'Polish the top bar', kind: 'directive',
  labels: ['founder'], priority: 5, epoch: 0, claim: null, createdAt: NOW - 60 * M, updatedAt: NOW - 52 * M,
  wrote: { body: { ts: NOW - 52 * M, source: 'founder' } },
  ...o,
});
const running = row({ status: 'claimed', claim: { holder: 'h', leaseUntil: NOW + 5 * M } });
const session = { itemId: 'w-1', product: 'agentbox', startedAt: NOW - 75_000, tail: [] };

describe('the state leads the line under the title, said once', () => {
  it('drops "In progress" and "Working" from a running thread and keeps the project and the engine', () => {
    const f = bylineFacts(running, { session, inProgress: true, engineChoice: true, now: NOW });
    expect(f.whereWord).toBe('In progress');
    expect(f.stateWord).toBe('Working');
    expect(said(stateLedParts(f, null))).toBe('Agentbox · Claude Code');
  });

  it('drops "In your inbox" from a waiting thread and keeps its clock', () => {
    const f = bylineFacts(row(), { now: NOW });
    expect(said(stateLedParts(f, 'last moved 52m ago'))).toBe('Agentbox · last moved 52m ago');
  });

  it('keeps Blocked, which no state word says', () => {
    const f = bylineFacts(row({ status: 'blocked' }), { now: NOW });
    expect(stateLedParts(f, null)).toContain('Blocked');
  });

  it('keeps what the fleet is doing about it when that is not the state again', () => {
    const queued = bylineFacts(row(), { inProgress: true, queued: ['w-1'], now: NOW });
    expect(stateLedParts(queued, null)).toContain('Queued');
    const paused = bylineFacts(row(), { inProgress: true, paused: true, now: NOW });
    expect(stateLedParts(paused, null)).toContain('Paused');
    const helpers = bylineFacts(running, { session: { ...session, helpers: 2 }, inProgress: true, now: NOW });
    expect(stateLedParts(helpers, null)).toContain('2 Subagents');
    expect(said(stateLedParts(helpers, null))).not.toMatch(/Working/);
  });

  it('does not print "Nothing running" under a thread whose state is Running', () => {
    const idle = bylineFacts(row(), { inProgress: true, now: NOW });
    expect(idle.stateWord).toBe('Nothing running');
    expect(said(stateLedParts(idle, null))).not.toMatch(/running/i);
  });

  it('draws the mark and the word first, then the run time, then the rest', () => {
    const html = draw(React.createElement(Byline, {
      item: running,
      facts: { session, inProgress: true, engineChoice: true },
      lead: React.createElement(ThreadStateMark, { item: running }),
    }));
    expect(text(html)).toBe('In progress 1m Agentbox · Claude Code');
    expect(html.indexOf('ts-st-run')).toBeLessThan(html.indexOf('In progress'));
    expect(html).not.toMatch(/live-word/);
  });

  it('leaves a row with no thread state exactly as it was', () => {
    const html = draw(React.createElement(Byline, { item: running, facts: { session, inProgress: true, engineChoice: true } }));
    expect(text(html)).toBe('Working 1m Agentbox · In progress · Claude Code');
  });

  it('says one of the four words, with its own mark', () => {
    const mark = (o) => draw(React.createElement(ThreadStateMark, { item: row(o) }));
    expect(text(mark({ result: 'Two tiers or three?', labels: [] }))).toBe('Waiting');
    expect(mark({ result: 'Two tiers or three?', labels: [] })).toContain('ts-st-need');
    expect(text(mark({ status: 'claimed', claim: { holder: 'h', leaseUntil: NOW + M } }))).toBe('In progress');
    expect(text(mark({ runAt: NOW + 60 * M }))).toBe('Scheduled');
    expect(mark({ runAt: NOW + 60 * M })).toContain('ts-st-sched');
    expect(text(mark({ status: 'done' }))).toBe('Done');
  });

  it('wears the type of the rest of the line, in the task bar', () => {
    const team = prose(read('renderer/src/team/team.css'));
    const rule = team.match(/([^{}]*\.workspace-task-header \.focus-meta \.fm-said[^{}]*)\{([^}]*)\}/);
    expect(rule).toBeTruthy();
    for (const sel of ['.ts-lead', '.live-word', '.live-span']) expect(rule[1]).toContain(`.workspace-task-header .focus-meta ${sel}`);
    expect(rule[2]).toMatch(/var\(--mono\)/);
    expect(rule[2]).toMatch(/text-transform: uppercase/);
    const css = prose(read('renderer/src/threads/summary.css'));
    expect(css).toMatch(/\.by-lead \.ts-lead ~ \.fm-said::before \{ content: '· '; \}/);
  });

  it('is handed the mark by the thread page, on every thread that has a state', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toContain('lead={summarised ? <ThreadStateMark item={item} /> : null}');
  });
});

describe('the right side is the Summary button and the dots', () => {
  it('no longer says the state at the right', () => {
    expect(text(draw(React.createElement(SummaryToggle, { open: false, onToggle: () => {} })))).toBe('Summary S');
    expect(summaryModule.ThreadStatusAndToggle).toBeUndefined();
  });

  it('portals the two of them into the corner and nothing else', () => {
    const focus = prose(read('renderer/src/components/Focus.tsx'));
    const portals = focus.match(/createPortal\([^\n]*cornerHeaderTarget\)/g);
    expect(portals).toHaveLength(1);
    expect(portals[0]).toMatch(/<SummaryToggle[\s\S]*\{threadMenu\}/);
    expect(focus).not.toMatch(/doneButton|terminalHeaderTarget|done-mark/);
  });

  it('offers code, terminal and done on a task whose run changed code', () => {
    expect(threadMenuRows({ change: true, terminal: 'closed', finish: true })).toEqual([
      { id: 'code', label: 'View code changes', key: null },
      { id: 'terminal', label: 'Open terminal', key: '⌘J' },
      { id: 'done', label: 'Mark done', key: 'E' },
    ]);
  });

  it('offers no code row when nothing changed, and says Hide while the terminal is open', () => {
    expect(threadMenuRows({ change: false, terminal: 'open', finish: true }).map((r) => r.label)).toEqual(['Hide terminal', 'Mark done']);
  });

  it('offers nothing to finish on a finished thread', () => {
    expect(threadMenuRows({ change: true, terminal: 'closed', finish: false }).map((r) => r.id)).toEqual(['code', 'terminal']);
  });

  it('offers a conversation with a person only Mark done, and draws no dots once that is gone', () => {
    expect(threadMenuRows({ change: false, terminal: null, finish: true }).map((r) => r.id)).toEqual(['done']);
    expect(draw(React.createElement(ThreadMenu, { terminal: null, onFinish: null }))).toBe('');
    const dots = draw(React.createElement(ThreadMenu, { terminal: null, onFinish: () => {} }));
    expect(dots).toContain('aria-haspopup="menu"');
    expect(dots).toContain('aria-expanded="false"');
    expect(dots).toContain('class="ts-more"');
  });

  it('draws each row with its key, and the figures as the code row’s detail', () => {
    const figures = React.createElement('span', { className: 'change-figures' }, '+873 −41 in 7 files');
    const html = draw(React.createElement(ThreadMenuList, {
      rows: threadMenuRows({ change: true, terminal: 'closed', finish: true }), change: figures, onPick: () => {},
    }));
    expect(text(html)).toBe('View code changes +873 −41 in 7 files Open terminal ⌘J Mark done E');
    expect(html).toContain('role="menu"');
    expect(html.match(/role="menuitem"/g)).toHaveLength(3);
    expect(html).toContain('<kbd>⌘J</kbd>');
    expect(html).toContain('<kbd>E</kbd>');
    // The two ticks that were the Done mark are its row's mark now.
    expect(html).toContain('m10.6 13 3.6 3.6L21 9');
  });

  it('wears the app’s popover: the dark card, square corners, rows that light on hover', () => {
    const menu = read('renderer/src/threads/ThreadMenu.tsx');
    expect(menu).toMatch(/className="th-menu ts-more-menu"/);
    const pages = prose(read('renderer/src/threads/pages.css'));
    expect(pages).toMatch(/\.th-menu \{[^}]*background: #363431;[^}]*border-radius: var\(--radius\)/);
    expect(pages).toMatch(/\.th-menu \.row-i:hover/);
    const css = prose(read('renderer/src/threads/summary.css'));
    expect(css).toMatch(/\.ts-more \{[^}]*width: 30px; height: 30px;[^}]*border-radius: var\(--radius\)/);
    expect(css).not.toMatch(/border-radius: (1[0-9]|[2-9][0-9])px|50%\s*;[^}]*ts-more/);
  });
});

describe('the menu is reachable by keyboard and every key still works', () => {
  const menu = prose(read('renderer/src/threads/ThreadMenu.tsx'));
  const app = read('renderer/src/App.tsx');
  const focus = prose(read('renderer/src/components/Focus.tsx'));

  it('closes on Escape before the window reads it as "go back"', () => {
    expect(menu).toMatch(/window\.addEventListener\('keydown', keys, true\)/);
    expect(menu).toMatch(/e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopImmediatePropagation\(\); close\(true\)/);
  });

  it('closes on a press outside it', () => {
    expect(menu).toMatch(/document\.addEventListener\('pointerdown', away\)/);
  });

  it('walks its rows with the arrows and opens from the keyboard', () => {
    expect(menu).toMatch(/'ArrowDown'/);
    expect(menu).toMatch(/'ArrowUp'/);
    expect(menu).toMatch(/role="menuitem"/);
    expect(menu).toMatch(/onKeyDown=\{openFromKeys\}/);
  });

  it('keeps E, ⌘J and S where they were', () => {
    expect(app).toContain("else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); markDone(focused); }");
    expect(app).toContain("window.dispatchEvent(new Event('task-terminal-toggle'));");
    expect(focus).toMatch(/useSummaryShortcut\(toggleSummary, summaryOffered\)/);
    // The menu's terminal row sends the very event ⌘J sends, and the terminal
    // tells the page whether it is open so the row can say Open or Hide.
    expect(focus).toContain("onToggleTerminal={() => window.dispatchEvent(new Event('task-terminal-toggle'))}");
    expect(focus).toContain('onOpenChange={setTerminalOpen}');
    expect(read('renderer/src/components/TaskTerminal.tsx')).toMatch(/onOpenChange\?\.\(open\)/);
  });
});

describe('the back chevron sits on the title’s line', () => {
  it('is raised one point against the header', () => {
    const nav = read('renderer/src/workspace-navigation.css');
    expect(nav).toContain('.workspace-task-header > .back-esc {\n position:absolute; left:0; top:-1px;');
  });
});
