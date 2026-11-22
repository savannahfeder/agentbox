// THE FIRST RUN KEEPS EACH TIP ON THE SCREEN IT IS ABOUT (w-fbe5e95dea, 2026-11-10).
//
// Fourth-round synthetic testers on fresh installs:
// - the walkthrough said "Press R to answer this agent" on a thread still
//   queued, because it counted an agent as busy only once its words shimmered;
// (The second fault, Home drawn over the old practice tutorial, went with that
// tutorial on 2026-11-21.)
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (f: string) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');

describe('the walkthrough', () => {
  it('counts a queued agent as busy', () => {
    expect(read('components/Tour.tsx')).toMatch(/busy: thread && !!document\.querySelector\('\.live-word\.is-shimmering, \.live-brief\.live-queued'\)/);
  });
});
