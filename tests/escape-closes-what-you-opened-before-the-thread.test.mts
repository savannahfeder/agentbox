// "I select something, it opens up and I hit esc to close that thing, and it
// gets the whole thread instead." Measured on the built app with sample threads
// (a browser clicked every control in every thread, then pressed Escape once):
// the terminal opened from the thread's menu, an expanded line of the agent's
// work ("Read files, searched files") and the running command's expanded steps
// all stayed open while one Escape closed the thread around them. Menus,
// pictures and files already took Escape first and passed the same sweep.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { openedHere, putAwayTheNewest } from '../renderer/src/escape-steps.ts';

const read = (p: string) => readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');

describe('Escape puts away the newest thing opened in the thread', () => {
  it('has nothing to put away when nothing is open, so the thread closes as before', () => {
    expect(putAwayTheNewest()).toBe(false);
  });

  it('puts away the newest first, one per press, then lets the thread go', () => {
    const shut: string[] = [];
    openedHere(() => shut.push('terminal'), 100);
    openedHere(() => shut.push('fold'), 200);
    expect(putAwayTheNewest()).toBe(true);
    expect(shut).toEqual(['fold']);
    expect(putAwayTheNewest()).toBe(true);
    expect(shut).toEqual(['fold', 'terminal']);
    expect(putAwayTheNewest()).toBe(false);
  });

  it('leaves alone what was opened before the file in the pane, so the file closes first', () => {
    const shut: string[] = [];
    const off = openedHere(() => shut.push('terminal'), 100);
    expect(putAwayTheNewest(150)).toBe(false);
    expect(shut).toEqual([]);
    // and once the file is down, the terminal is next
    expect(putAwayTheNewest()).toBe(true);
    expect(shut).toEqual(['terminal']);
    off();
  });

  it('puts away something opened after the file before the file', () => {
    const shut: string[] = [];
    openedHere(() => shut.push('fold'), 300);
    expect(putAwayTheNewest(150)).toBe(true);
    expect(shut).toEqual(['fold']);
  });

  it('forgets a thing that was closed by hand', () => {
    const shut: string[] = [];
    const off = openedHere(() => shut.push('terminal'), 100);
    off();
    expect(putAwayTheNewest()).toBe(false);
    expect(shut).toEqual([]);
  });
});

describe('the thread asks before it leaves', () => {
  const app = read('App.tsx');

  it('in your own thread, after the file rule decides whether the file counts', () => {
    expect(app).toContain("if (e.key === 'Escape' && putAwayTheNewest(escapeClosesDoc(openDoc, fullScreenDoc) ? (fullScreenDoc ? Infinity : docOpenedAt.current) : -Infinity)) e.preventDefault();\n        else if (e.key === 'Escape') { if (escapeClosesDoc(openDoc, fullScreenDoc)) closeArtifact(); else setFocused(null); }");
  });

  it("on a teammate's card too", () => {
    expect(app).toContain("if (e.key === 'Escape') { e.preventDefault(); if (putAwayTheNewest(openDoc ? docOpenedAt.current : -Infinity)) return; if (openDoc) closeArtifact(); else { setOpenCard(null); setTeamOpen(false); } }");
  });

  it('and the terminal, the work lines and the running steps say when they open', () => {
    expect(read('components/TaskTerminal.tsx')).toContain('useEscapePutsAway(');
    expect(read('components/Thread.tsx')).toContain('useEscapePutsAway(');
    expect(read('components/Live.tsx')).toContain('useEscapePutsAway(');
  });
});
