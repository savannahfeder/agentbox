// ⌘K ON A PHONE (w-33611c2122).
//
// The phone's magnifier opened only the thread search. Asked for ⌘K there
// instead: threads and commands, in a phone's shape. Measured in the built
// app at 390 by 844 with the phone door on: ⌘K opened as the desktop's box,
// with key caps, "esc", an "↑ ↓ move" footer, and Approve and Mark done for a
// row the phone never shows as picked. Now it fills the screen with Cancel,
// lists threads before commands, and offers nothing that needs the Mac.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Palette, NOT_ON_A_PHONE, paletteOrder } from '../renderer/src/components/Palette';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const noop = () => {};
const draw = (props = {}) => renderToStaticMarkup(createElement(Palette, {
  products: [], supervisorPaused: false, look: 'dark', onSetLook: noop, onOpenFilter: noop, onClearFilter: noop,
  onView: noop, onPause: noop, onResume: noop, onRankFirst: noop, onNewProject: noop, onNewThread: noop,
  onStanding: noop, onSettings: noop, onShortcuts: noop, keyHints: true, onSetKeyHints: noop, onSearch: noop,
  onFirstRun: noop, onTutorial: noop, onImportAgents: noop, onFreshUser: noop, onDemo: noop, onClose: noop,
  onCheckUpdate: noop, onFlipView: noop, findThreads: () => [], ...props,
}));
const rows = (html) => [...html.matchAll(/class="palette-label">([^<]+)</g)].map((m) => m[1]);
const row = (id) => ({ id, label: id, run: noop });

describe('the box on a phone', () => {
  const phone = draw({ phone: true });
  const desk = draw();

  it('fills the screen, with Cancel and no keys', () => {
    expect(phone).toContain('palette-on-phone');
    expect(phone).toContain('>Cancel</button>');
    expect(phone).not.toContain('palette-esc');
    expect(phone).not.toContain('palette-key');
    expect(phone).not.toContain('palette-foot');
  });

  // The tiles were picked; drawn with one line each, "General agent
  // instructions…" read "General agent instr…" (w-33611c2122).
  it('lays the commands out as tiles before anything is typed, every name whole', () => {
    expect(phone).toContain('class="palette-list palette-tiles"');
    expect(desk).not.toContain('palette-tiles');
    const css = fs.readFileSync(new URL('../renderer/src/phone.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.palette-tiles \.palette-label \{[^}]*white-space: normal;[^}]*text-overflow: clip;/);
  });

  it('offers nothing about the Mac or its keyboard', () => {
    for (const label of ['Keyboard shortcuts', 'Check for updates', 'Take the tutorial', 'Search threads']) {
      expect(rows(desk)).toContain(label);
      expect(rows(phone)).not.toContain(label);
    }
    expect(NOT_ON_A_PHONE).toContain('open-terminal');
  });

  it('keeps what a phone can do', () => {
    for (const label of ['New thread', 'Inbox', 'Settings…']) expect(rows(phone)).toContain(label);
  });

  it('leaves the desktop box as it was', () => {
    expect(desk).not.toContain('palette-on-phone');
    expect(desk).toContain('palette-esc');
    expect(desk).toContain('palette-foot');
  });
});

describe('what comes first', () => {
  const commands = [row('new-thread'), row('settings')];
  const threads = [row('thread-a'), row('all-threads')];

  it('puts threads first on a phone, each section labelled', () => {
    const { rows: r, labels } = paletteOrder(commands, threads, true);
    expect(r.map((c) => c.id)).toEqual(['thread-a', 'all-threads', 'new-thread', 'settings']);
    expect([...labels]).toEqual([[0, 'Threads'], [2, 'Commands']]);
  });

  it('labels nothing on a phone before anything is typed', () => {
    expect([...paletteOrder(commands, [], true).labels]).toEqual([]);
  });

  it('keeps commands first on the desktop', () => {
    const { rows: r, labels } = paletteOrder(commands, threads);
    expect(r.map((c) => c.id)).toEqual(['new-thread', 'settings', 'thread-a', 'all-threads']);
    expect([...labels]).toEqual([[2, 'Threads']]);
  });
});

describe('the app', () => {
  it('draws the phone box on a phone', () => {
    expect(app).toMatch(/<Palette\n\s+open=\{modal === 'palette'\}\n\s+phone=\{onPhone\(\)\}/);
  });

  it('acts on a phone only on the thread that is open', () => {
    expect(app).toContain('const target = focused ?? (onPhone() ? null : pointed);');
  });
});
