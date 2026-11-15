// THE PHONE APP'S BOTTOM BAR SITS ABOVE THE HOME BAR, AND SEARCH IS UP TOP.
//
// Tried on an iPhone (2026-10-21): "the nav literally touches the corner and
// everything is almost super low", and "I would expect the search icon to be
// in the top bar not the bottom". The app kept the phone website's room under
// its tabs, the home bar's 34px less 14 (phone.css `--phone-foot`), so the
// tabs sat 20px off the bottom edge with the home bar running through them,
// and the reply box and the new-thread page sat as low. Photographed at 402x874.
// An app keeps the whole home bar free, as iOS's own tab bars do, and search
// moves from the end of the tabs, where it also cut "Done" short, to the top bar.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const screens = ['mobile/src/app/index.tsx', 'mobile/src/app/new.tsx', 'mobile/src/app/thread/[product]/[id].tsx', 'mobile/src/ui/Approvals.tsx'];

describe("the phone app's bottom bar", () => {
  it('keeps the whole home bar free, and 8px where a phone has none', () => {
    expect(read('mobile/src/ui/parts.tsx')).toMatch(/export const footRoom = \(inset: \{ bottom: number \}\) => Math\.max\(8, inset\.bottom\);/);
  });

  for (const file of screens) {
    it(`${file} sits on that room, not 14px into the home bar`, () => {
      const src = read(file);
      expect(src).not.toMatch(/inset\.bottom - 14/);
      expect(src).toMatch(/footRoom\(inset\)/);
    });
  }
});

describe("the inbox's search", () => {
  const inbox = read('mobile/src/app/index.tsx');
  const tabs = inbox.slice(inbox.indexOf('function Tabs('), inbox.indexOf('\n}\n', inbox.indexOf('function Tabs(')));

  it('is no longer at the end of the tabs', () => {
    expect(tabs).not.toMatch(/Magnifier/);
    expect(tabs).not.toMatch(/Search threads/);
  });

  it('is in the top bar on the list and the board alike', () => {
    expect(inbox).toMatch(/<TopBar title=\{teamMode \? 'Inbox' : 'Threads'\} right=\{<>\s*<IconButton label="Search threads" onPress=\{\(\) => router\.push\('\/search'\)\}><Magnifier size=\{18\} \/><\/IconButton>/);
  });
});
