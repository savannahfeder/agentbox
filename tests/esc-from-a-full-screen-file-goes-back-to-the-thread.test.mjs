// Two power testers on 2026-11-04 opened a thread whose table the thread had
// opened beside it by itself, pressed Focus to see it full screen, and pressed
// Esc: both the table and the thread were gone and they were on the list.
// Reproduced in a test copy the same way. Esc skips a file the thread opened
// by itself (so leaving a thread stays one press), and that rule still held
// after the person had made the file full screen themselves. Esc goes back one
// step, so from full screen it now goes back to the thread.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { escapeClosesDoc } from '../renderer/src/doc-pane.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const doc = { product: 'p', src: 'leads/fintech-leads.csv' };

describe('Esc with a file open in a thread', () => {
  it('puts down a full-screen file the thread opened by itself', () => {
    expect(escapeClosesDoc({ ...doc, auto: true }, true)).toBe(true);
  });

  it('still leaves the thread past a file the thread opened beside it', () => {
    expect(escapeClosesDoc({ ...doc, auto: true }, false)).toBe(false);
    expect(escapeClosesDoc({ ...doc, auto: true })).toBe(false);
  });

  it('puts down a file the person opened, beside or full screen', () => {
    expect(escapeClosesDoc(doc, false)).toBe(true);
    expect(escapeClosesDoc(doc, true)).toBe(true);
  });

  it('has nothing to put down with no file open', () => {
    expect(escapeClosesDoc(null, true)).toBe(false);
  });

  it('is asked with whether the file is full screen', () => {
    expect(app).toContain("if (e.key === 'Escape') { if (escapeClosesDoc(openDoc, fullScreenDoc)) closeArtifact(); else setFocused(null); }");
  });
});
