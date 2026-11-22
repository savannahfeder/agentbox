// On 2026-11-19 the desktop took out a thread's side summary, the icon that
// opened it at the right of the phone layout's thread bar, and its line in
// mobile/parity.mjs (9d1a78df0). The phone app kept its own copy: a "Show the
// summary" button in the thread bar opening a sheet of Context, Done, Status,
// Priority, Owner, Project and Updated. Found by the phone parity audit of
// 2026-11-21, comparing the phone preview with the desktop's phone layout.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8');
const offers = fs.readFileSync('mobile/src/lib/thread-offers.ts', 'utf8');
const desktopPhone = fs.readFileSync('renderer/src/phone.css', 'utf8');

describe('a phone thread has no summary sheet, as the desktop has none', () => {
  it('draws no summary button in the thread bar', () => {
    expect(page).not.toMatch(/Show the summary/);
    expect(page).not.toMatch(/<Panel \/>/);
  });
  it('has no summary sheet', () => {
    expect(page).not.toMatch(/function Summary\(/);
    expect(offers).not.toMatch(/export function summaryParts/);
  });
  it('still shows the context under the title, as the desktop does', () => {
    expect(page).toMatch(/page\.context/);
  });
  it('the desktop layout it follows has no summary rail either', () => {
    expect(desktopPhone).not.toMatch(/\.ts-rail/);
  });
});
