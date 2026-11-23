// ASKED ONTO A TEAMMATE'S THREAD, YOU LAND AT THE ASK (w-f702d60afe, 2026-11-20).
//
// Opening Sam's thread from his ask drew it from the top. On a thread with any
// history the ask, its Hand back button and the box to write to the agent were
// below the window, measured at 1512x945 with four messages above the ask.
// Asked onto it, the page now opens at its end, once per thread, so scrolling
// up afterwards is left alone.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');

describe("a teammate's thread you were asked onto", () => {
  it('opens at its end when there is an ask, once per thread', () => {
    expect(page).toMatch(/if \(!ask \|\| !work \|\| landed\.current === threadId\) return;/);
    expect(page).toMatch(/pane\.scrollTop = pane\.scrollHeight/);
  });
});
