// AN IMPORTED CHAT OPENS ON THE CLEAN PAGE (w-31c71743b5, 2026-10-29).
//
// What broke: a Claude Code chat brought in at setup has two messages, the
// person's first and the agent's last. A short thread is drawn whole
// (a-short-thread-is-drawn-whole-with-your-ask-in-it), so the founder's first
// look at an imported chat was "You", her own words, "Started in Claude Code",
// a RESULT label and the agent's raw last message: "people are going to
// evaluate it as 'Oh it's just the same as Codex or Claude Code.'" A chat that
// was brought in opens on the one-question page instead, with what was written
// before it behind the fold.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { broughtIn, drawnWhole } from '../renderer/src/one-thing-at-a-time.ts';

describe('which threads were brought in', () => {
  it('a Claude Code chat', () => {
    expect(broughtIn({ labels: ['thread-import', 'thread:abc'] })).toBe(true);
  });
  it('a Codex chat', () => {
    expect(broughtIn({ labels: ['codex', 'codex:abc'] })).toBe(true);
  });
  it('not a thread you wrote, an agent filed, or a Codex offer still asking', () => {
    expect(broughtIn({ labels: ['founder'] })).toBe(false);
    expect(broughtIn({ labels: [] })).toBe(false);
    expect(broughtIn({})).toBe(false);
    expect(broughtIn({ labels: ['codex-import'] })).toBe(false);
  });
});

describe('the page it opens on', () => {
  it('folds a brought-in chat however short it is', () => {
    expect(drawnWhole(1, true)).toBe(false);
    expect(drawnWhole(2, true)).toBe(false);
  });
  it('still draws a short thread of your own whole', () => {
    expect(drawnWhole(1)).toBe(true);
    expect(drawnWhole(2, false)).toBe(true);
  });
  it('folds a long one either way', () => {
    expect(drawnWhole(3)).toBe(false);
    expect(drawnWhole(3, true)).toBe(false);
  });
  it('is what the thread page asks', () => {
    const page = fs.readFileSync(new URL('../renderer/src/components/ItemThread.tsx', import.meta.url), 'utf8');
    expect(page).toContain('const short = !earlierOpen && drawnWhole(behind, broughtIn(item));');
  });
});

describe('while it is still being written up', () => {
  // Measured 2026-10-29 in a fresh window: the tip said "Press ↵ to open it"
  // within a second of landing, and the rewrite (main/catch-up.mjs) landed
  // twenty seconds later, so the first look was still the raw chat.
  const read = (f) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');
  it('the page says so instead of drawing the raw answer', () => {
    expect(read('components/ItemThread.tsx')).toContain('if (queue && catchUpDue(item)) {');
  });
  it('the row says so, and the tutorial waits for it', () => {
    expect(read('components/List.tsx')).toContain("data-catching-up={catchUpDue(item) ? '1' : undefined}");
    expect(read('components/Tour.tsx')).toContain(".list-pane .row[data-item-id]:not([data-catching-up])");
  });
});
