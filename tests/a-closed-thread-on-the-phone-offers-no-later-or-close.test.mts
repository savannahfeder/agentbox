// A CLOSED THREAD ON THE PHONE OFFERS NO LATER OR CLOSE (w-e4d49a1539).
//
// Round 1 of the 2026-11-03 phone testers: on a closed thread, More still
// offered Later, and choosing it said "Moved to Later. Back in 30 minutes"
// while the thread stayed under Done today (issue 7, logged twice); a closed
// thread still offered "Close this thread" (issue 13). The lists never put a
// closed thread in Later, so the menu no longer offers either on one.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const menu = fs.readFileSync('mobile/src/ui/ThreadMenu.tsx', 'utf8');
const page = fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8');

describe("a closed thread's menu", () => {
  it('the thread page tells the menu the thread is closed', () => {
    expect(page).toMatch(/closed=\{threadState\(item\) === 'done'\}/);
  });
  it('the menu leaves out Later, its times and Close for a closed thread', () => {
    expect(menu).toMatch(/\{!closed && <>\s*<SheetHead>Later<\/SheetHead>/);
    expect(menu).toMatch(/\{!closed && <SheetRow label="Close this thread"/);
  });
});
