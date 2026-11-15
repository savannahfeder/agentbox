// A TEAMMATE'S THREAD PAGE DRAWS ONE LINE BETWEEN ITS PARTS.
//
// Two testers opened Dev's "Seat picker for group bookings" from his page and
// saw two lines stacked between ABOUT and DONE in the card on the right. On
// that page every part draws the line under itself (pages.css .tp-side
// .ts-tk-part), and the Done part also drew one over itself (summary.css).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const pages = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/threads/pages.css'), 'utf8');

describe('the card beside a teammate’s thread', () => {
  it('lets Done lean on the line About already drew', () => {
    expect(pages).toMatch(/\.tp-side \.ts-tk-part \{ padding: 0 0 18px; margin: 0 0 18px; border-bottom: 1px solid var\(--line\); \}/);
    expect(pages).toMatch(/\.tp-side \.ts-tk-done \{ padding-top: 0; border-top: 0; \}/);
  });
});
