// THE SKIP CONFIRMATION KEEPS THE KEYS WHILE IT ASKS (w-fbe5e95dea, 2026-11-10).
//
// A final-round tester opened "Skip the tutorial?" and pressed Ctrl K: the
// command bar opened behind the confirmation, and New project then opened a
// folder chooser behind it too, with only Skip it and Keep going reachable.
// While the card asks, it keeps every key but the ones its own buttons need.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../renderer/src/components/Onboarding.tsx', import.meta.url), 'utf8');

describe('the skip confirmation', () => {
  it('lets Enter, Space and Tab reach its own buttons', () => {
    expect(src).toMatch(/if \(e\.key === 'Enter' \|\| e\.key === ' ' \|\| e\.key === 'Tab'\) return;/);
  });
  it('keeps every other key, Ctrl K included, from the app behind it', () => {
    const fn = src.slice(src.indexOf('export function WayOut'), src.indexOf('export function WayOut') + 1800);
    expect(fn).toMatch(/if \(e\.key !== 'Escape'\) \{ e\.preventDefault\(\); e\.stopImmediatePropagation\(\); return; \}/);
  });
});
