// THE USAGE ROW NAMES THE AGENT YOU USED LAST (w-dcaa2c122e, 2026-10-24).
//
// "What if the main harness I use is Codex? ... What if I use both?" Measured
// on the stage: using both, the sidebar's row was named for whichever agent
// had more threads running, else the default, so its name could change under
// you and the other agent showed only in Settings; using only Codex, it said
// "Usage". Decided: "we should really go with the agent you used last in
// general. If the last agent used was Claude Code, it should say 'Claude Code
// 47%.' If you have multiple accounts, like Claude Code and Codex, you can hover
// over to see them both."
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UsagePill, agentsInUse } from '../renderer/src/components/UsagePill.tsx';
import { lastUsedEngine } from '../renderer/src/usage-last-used.ts';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-24T09:00:00Z');
const DAY = 86400_000;
const reading = (engine, session, ago = 0) => ({ engine, at: NOW - ago, limits: [
  { span: 'session', qualifier: null, name: 'This session', percent: session, resetsAt: NOW + 2 * 3600_000 },
  { span: 'week', qualifier: null, name: 'This week', percent: 30, resetsAt: NOW + 3 * DAY },
] });
const claude = reading('claude', 47);
const codex = reading('codex', 64);
const row = (props) => renderToStaticMarkup(createElement(UsagePill, { now: NOW, sidebar: true, engineWord: null, usage: claude, all: [claude, codex], ...props }));
const said = (html) => [...html.matchAll(/class="usage-row-(?:label|num)">([^<]*)</g)].map((m) => m[1]).join(' ');

describe('which agent you used last', () => {
  const snap = (o) => ({ supervisor: { running: [] }, items: [], engines: { byItem: {} }, ...o });
  it('is the agent of the newest thread running now', () => {
    expect(lastUsedEngine(snap({ supervisor: { running: [{ engine: 'claude', startedAt: 1 }, { engine: 'codex', startedAt: 2 }] } }))).toBe('codex');
  });
  it('else the agent of the thread touched last', () => {
    const items = [{ id: 'a', updatedAt: 5 }, { id: 'b', updatedAt: 9 }];
    expect(lastUsedEngine(snap({ items, engines: { byItem: { a: 'codex', b: 'claude' } } }))).toBe('claude');
  });
  it('and nothing when nothing has run', () => {
    expect(lastUsedEngine(snap({}))).toBe(null);
    expect(lastUsedEngine(null)).toBe(null);
  });
});

describe('the row', () => {
  it('names the agent you used last, with its figure', () => {
    expect(said(row({ recent: 'claude' }))).toBe('Claude Code 47%');
    expect(said(row({ recent: 'codex' }))).toBe('Codex 64%');
  });
  it('falls back to the reading the app sent when it cannot tell which you used last', () => {
    expect(said(row({ recent: null }))).toBe('Claude Code 47%');
  });
  it('passes over an agent with no reading this week', () => {
    expect(said(row({ recent: 'codex', all: [claude, reading('codex', 64, 8 * DAY)] }))).toBe('Claude Code 47%');
  });
  it('names the one agent on a Mac that has one, and never says Usage', () => {
    const only = reading('codex', 12);
    expect(said(row({ usage: only, all: [only], recent: 'codex' }))).toBe('Codex 12%');
    expect(row({ usage: only, all: [only] })).not.toContain('>Usage<');
  });
  it('still draws from the reading alone on a payload with no list of agents', () => {
    expect(said(row({ all: undefined, recent: undefined }))).toBe('Claude Code 47%');
  });
  it('draws nothing before any reading lands', () => {
    expect(row({ usage: null, all: [] })).toBe('');
  });
});

describe('pointing at it', () => {
  it('lists every agent with a reading this week, the one used last first', () => {
    expect(agentsInUse([claude, codex], 'codex', claude, NOW).map((a) => a.word)).toEqual(['Codex', 'Claude Code']);
    expect(agentsInUse([claude, codex], 'claude', claude, NOW).map((a) => a.word)).toEqual(['Claude Code', 'Codex']);
    expect(agentsInUse([claude, reading('codex', 64, 8 * DAY)], 'codex', claude, NOW).map((a) => a.word)).toEqual(['Claude Code']);
  });
  it('opens the panel, after a beat in the sidebar so a pointer crossing the foot does not flash it', () => {
    const pill = read('../renderer/src/components/UsagePill.tsx');
    expect(pill).toContain('onMouseEnter={enter} onMouseLeave={leave}');
    expect(pill).toContain('if (sidebar) linger.current = setTimeout(() => setHovering(true), 120);');
  });
  it('tags the agent used last when there is more than one', () => {
    expect(read('../renderer/src/components/UsagePill.tsx')).toContain('<small>Last used</small>');
  });
});

describe('the trials it was picked from', () => {
  it('leave no switch behind', () => {
    const pill = read('../renderer/src/components/UsagePill.tsx');
    const css = read('../renderer/src/workspace-navigation.css');
    for (const gone of ['usage.both', 'readBoth', "'highest'", "'plain'", 'usage-row-bars']) expect(pill).not.toContain(gone);
    expect(css).not.toContain('usage-row-bars');
  });
});
