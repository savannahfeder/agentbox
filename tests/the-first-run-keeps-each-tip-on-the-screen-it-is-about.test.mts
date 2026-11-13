// THE FIRST RUN KEEPS EACH TIP ON THE SCREEN IT IS ABOUT (w-fbe5e95dea, 2026-11-10).
//
// Fourth-round synthetic testers on fresh installs:
// - the walkthrough said "Press R to answer this agent" on a thread still
//   queued, because it counted an agent as busy only once its words shimmered;
// - with Home now on by default, the practice tutorial ran with Home drawn
//   over the inbox, so tips about tabs, the board and an open thread pointed
//   at a screen that was not there, and N and Tab moved nothing it watched;
// - on the invite step, Enter added an address and then nothing would send.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (f: string) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');

describe('the walkthrough and the practice tutorial', () => {
  it('counts a queued agent as busy', () => {
    expect(read('components/Tour.tsx')).toMatch(/busy: thread && !!document\.querySelector\('\.live-word\.is-shimmering, \.live-brief\.live-queued'\)/);
  });
  it('puts Home away while the practice tutorial runs', () => {
    expect(read('App.tsx')).toMatch(/const homeShown = homeOn && homeOpen && !run && /);
  });
});

describe('the invite step', () => {
  it('sends with Enter once the address box is empty', () => {
    expect(read('components/SetupSplit.tsx')).toMatch(/enter === 'add'\) \{ e\.preventDefault\(\); if \(typed\.trim\(\)\) addEmail\(\); else primary\.current\(\); return; \}/);
  });
});
