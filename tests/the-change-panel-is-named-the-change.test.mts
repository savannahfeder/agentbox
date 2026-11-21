// THE CHANGE PANEL IS NAMED THE CHANGE (w-f702d60afe, 2026-11-21).
//
// A screen review of a thread with its change open: the panel's header read
// "runs › w-53fa687b6b › the-change-it-made.change", the folder the app keeps a
// run's change in, which looked like a mockup.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const pane = fs.readFileSync(new URL('../renderer/src/components/DocPane.tsx', import.meta.url), 'utf8');
const rule = /(^|\/)runs\/w-[0-9a-f]+\/the-change-it-made\.change$/;

describe("a run's change in the document pane", () => {
  it('is headed The change', () => {
    expect(pane).toContain("? ['The change'] : crumbParts(resolved ?? doc.src, roots)");
    expect(rule.test('runs/w-53fa687b6b/the-change-it-made.change')).toBe(true);
    expect(rule.test('/Users/x/store/api/runs/w-53fa687b6b/the-change-it-made.change')).toBe(true);
  });
  it('leaves any other file its own path', () => {
    expect(rule.test('runs/w-53fa687b6b/notes.md')).toBe(false);
    expect(rule.test('docs/the-change-it-made.change.md')).toBe(false);
  });
});
