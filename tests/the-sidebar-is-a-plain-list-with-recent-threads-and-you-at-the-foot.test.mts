// THE SIDEBAR IS A PLAIN LIST, WITH THE THREADS YOU LAST OPENED AND YOU AT THE FOOT.
//
// After the pages were redrawn the sidebar "looks ugly" beside them. Five
// rounds of pictures over the real app ended on one the owner approved,
// 2026-11-23: Linear's structure in Notion's manner. Search is a field that
// shows its keys, a pencil beside the team name starts a thread, Workspace and
// Recent are headed sections, and the last row is you, with what is left of
// your limit as a small bar on it ("1 bar is perfect. ship it"). Her one note:
// "don't show the recents in the sidebar when closed."
//
// Measured in the app at 1760x1005 before and after: the row of words
// "Claude Code 71%" is gone from the foot, Settings is no longer a row once
// your account menu holds it, and folded, the sidebar draws no Recent row.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RECENT_LIMIT, recentThreads } from '../renderer/src/recent-threads.ts';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation.tsx';
globalThis.React = React;

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const item = (id) => ({ id });

describe('the threads you last opened', () => {
  it('come newest first', () => {
    const got = recentThreads([item('a'), item('b'), item('c')], { a: 10, b: 30, c: 20 });
    expect(got.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });
  it('leave out a thread you never opened', () => {
    expect(recentThreads([item('a'), item('b')], { a: 10 }).map((i) => i.id)).toEqual(['a']);
  });
  it('leave out a thread you marked unread, which is kept as 0', () => {
    expect(recentThreads([item('a'), item('b')], { a: 0, b: 5 }).map((i) => i.id)).toEqual(['b']);
  });
  it('leave out a thread that is no longer on this computer', () => {
    expect(recentThreads([item('a')], { a: 10, gone: 99 }).map((i) => i.id)).toEqual(['a']);
  });
  it('stop at the limit, and not one before it', () => {
    const many = Array.from({ length: RECENT_LIMIT + 3 }, (_, n) => item(`t${n}`));
    const seen = Object.fromEntries(many.map((i, n) => [i.id, n + 1]));
    expect(recentThreads(many, seen)).toHaveLength(RECENT_LIMIT);
    expect(recentThreads(many.slice(0, RECENT_LIMIT), seen)).toHaveLength(RECENT_LIMIT);
    expect(recentThreads(many.slice(0, RECENT_LIMIT - 1), seen)).toHaveLength(RECENT_LIMIT - 1);
  });
  it('are nothing at all for someone who has opened nothing', () => {
    expect(recentThreads([item('a')], {})).toEqual([]);
  });
});

describe('the sidebar, as it was approved', () => {
  const nav = read('renderer/src/components/WorkspaceNavigation.tsx');
  const css = strip(read('renderer/src/sidebar.css'));
  it('starts a thread from the pencil beside the team name', () => {
    expect(nav).toMatch(/className="ws-new"[^>]*aria-label="New thread"[^>]*onClick=\{onCompose\}/);
  });
  it('heads Workspace and Recent, and Recent is drawn only when there is something in it', () => {
    expect(nav).toMatch(/<SectionHead id="workspace"/);
    expect(nav).toMatch(/recent\.length > 0 &&/);
    expect(nav).toMatch(/<SectionHead id="recent"/);
  });
  it('draws no Recent row while it is closed', () => {
    expect(css).toMatch(/\.workspace-collapsed \.gt-rail-nav \.ws-recent[^{]*\{[^}]*visibility:\s*hidden/);
  });
  it('draws Recent with a mark, a name and a dot on what waits on you, and nothing for nobody', () => {
    const rows = [
      { key: 'a', mark: createElement('i', { className: 'm' }), title: 'First', waits: true, onOpen() {} },
      { key: 'b', mark: createElement('i', { className: 'm' }), title: 'Second', waits: false, onOpen() {} },
    ];
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation, { view: 'inbox', collapsed: false, rail: true, onView() {}, onSearch() {}, onCompose() {}, recent: rows }));
    expect([...html.matchAll(/class="ws-recent-row" title="([^"]+)"/g)].map((m) => m[1])).toEqual(['First', 'Second']);
    expect(html.match(/aria-label="Waiting on you"/g)).toHaveLength(1);
    const none = renderToStaticMarkup(createElement(WorkspaceNavigation, { view: 'inbox', collapsed: false, rail: true, onView() {}, onSearch() {}, onCompose() {}, recent: [] }));
    expect(none).not.toContain('ws-recent');
    const phone = renderToStaticMarkup(createElement(WorkspaceNavigation, { view: 'inbox', collapsed: true, rail: false, onView() {}, onSearch() {}, onCompose() {}, recent: rows }));
    expect(phone).not.toContain('ws-recent');
    expect(phone).not.toContain('ws-new');
    expect(phone).not.toContain('ws-sec');
  });
  // "these aren't centered + have a strange color background", on the first build.
  // Measured at eight times size: an older rule sizes every drawing in the sidebar
  // to 18, so an agent's mark overflowed its 16 point tile and sat 1 right and 1 low
  // of its row, and the tile's grey fill and rim were grey on the sidebar's grey.
  it('draws an agent’s mark in Recent bare, at its own size, so it sits on its row’s middle', () => {
    const P = ':root:root .gt-rail-nav.workspace-navigation .ws-recent-mark > .harness-mark';
    expect(css).toContain(`${P} { width: 16px; height: 16px; margin: 0; border: 0; background: none; }`);
    expect(css).toContain(`${P} > svg { flex: none; width: 20px; height: 20px; margin: -2px; }`);
    // The rule it has to beat, which is why the size is said outright.
    expect(strip(read('renderer/src/workspace-navigation.css'))).toContain('.workspace-navigation svg { width: 18px; height: 18px; flex: none; }');
  });
  const me = { id: 'me', email: 'me@example.com', name: 'Me', avatarUrl: null };
  const team = { configured: true, signedIn: true, me, team: { id: 't', name: 'Team' }, people: [me], cards: [], lastSyncAt: 0, error: null };
  const draw = (props = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
    view: 'inbox', collapsed: false, rail: true, onView() {}, onSearch() {}, onCompose() {}, onSettings() {}, onFeedback() {}, ...props,
  }));
  const settingsRow = (html) => html.match(/<button aria-label="Settings"[^>]*>/)?.[0] ?? null;
  it('hides the Settings row at desktop sizes once your account menu holds Settings', () => {
    expect(settingsRow(draw({ team, onAccount() {} }))).toContain('class="ws-in-menu"');
    expect(css).toMatch(/\.workspace-utilities > \.ws-in-menu \{ display: none; \}/);
  });
  it('keeps the Settings row for someone who is not signed in', () => {
    expect(settingsRow(draw())).not.toContain('ws-in-menu');
    expect(settingsRow(draw({ team: { ...team, signedIn: false, me: null } }))).not.toContain('ws-in-menu');
  });
  // A small desktop window is drawn as a phone, where that row is the only way into Settings.
  it('still makes the row for a signed-in person, and hides it only in a window bigger than a phone', () => {
    expect(settingsRow(draw({ team, onAccount() {} }))).not.toBeNull();
    const fence = read('renderer/src/sidebar.css').match(/@media \(min-width: 701px\) and \(min-height: 521px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(fence).toContain('.ws-in-menu');
    expect(css).toMatch(/@media \(max-width: 700px\), \(max-height: 520px\) \{\s*:root:root \.gt-rail-nav\.workspace-navigation :is\(\.ws-new, \.ws-sec, \.ws-recent\) \{ display: none; \}/);
  });
  it('is the same on a real phone as it was, which has no account row to hold Settings', () => {
    expect(settingsRow(draw({ rail: false, team, onAccount() {} }))).not.toContain('ws-in-menu');
  });
  it('is the same on a phone as it was: none of this is drawn outside the desktop layout', () => {
    expect(nav).toMatch(/\{rail && onCompose && <button type="button" className="ws-new"/);
    expect(nav).toMatch(/\{rail && recent\.length > 0 &&/);
    for (const rule of css.matchAll(/([^{}]+)\{/g)) {
      if (rule[1].trim().startsWith('@')) continue;
      // A comma inside :is(...) is not the end of a selector.
      const selectors = rule[1].split(/,(?![^()]*\))/).map((s) => s.trim()).filter(Boolean);
      for (const s of selectors) expect(s, s).toMatch(/gt-rail/);
    }
  });
});

describe('what is left of your limit, in the sidebar', () => {
  const pill = read('renderer/src/components/UsagePill.tsx');
  it('is the bar, and no longer a row of words', () => {
    expect(pill).not.toMatch(/usage-row-label/);
    expect(pill).toMatch(/<span className="usage-meter" aria-hidden="true">/);
  });
  it('still says the whole of it to whatever reads it aloud', () => {
    expect(pill).toMatch(/aria-label=\{sentence\}/);
  });
});
