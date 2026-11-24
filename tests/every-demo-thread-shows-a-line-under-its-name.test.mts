// In the demo inbox the "Sign in with Google" row had no line under its name
// (2026-11-24, seen on an onboarding call). Its answer opened "Sign in with
// Google is built…", and the list drops a line that only says the row's name
// again, so the row looked broken. Measured by running each demo row through
// the same rules the inbox draws with.

import { describe, expect, it } from 'vitest';
import { demoLedgerLines } from '../shared/demo-world.mts';
import { asideBesides, rowSummary } from '../renderer/src/list-rules.ts';

type Row = { id: string; title?: string; label?: string; body?: string; result?: string; status?: string; wrote: Record<string, { ts: number }> };

function rows(): Row[] {
  const out = new Map<string, Row>();
  for (const lines of Object.values(demoLedgerLines(1_800_000_000_000))) {
    for (const l of lines) {
      const row = out.get(l.id) ?? { id: l.id, wrote: {} };
      for (const [k, v] of Object.entries(l.patch)) {
        (row as Record<string, unknown>)[k] = v;
        row.wrote[k] = { ts: l.ts };
      }
      out.set(l.id, row);
    }
  }
  return [...out.values()];
}

describe('every demo thread shows a line under its name', () => {
  const all = rows();

  it('has threads to check', () => {
    expect(all.length).toBeGreaterThan(3);
  });

  for (const row of all) {
    it(`${row.label}`, () => {
      const line = asideBesides(row.label ?? row.title ?? '', rowSummary(row, row.status === 'done' ? 'done' : 'inbox'));
      expect(line, `${row.label} shows nothing under its name`).toBeTruthy();
    });
  }

  it('and a line that only repeats the name is still dropped', () => {
    expect(asideBesides('Sign in with Google', 'Sign in with Google is built.')).toBeNull();
  });
});
