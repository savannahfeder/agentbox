// AN URGENT MARK PUT AWAY BY LEAVING ITS THREAD STAYS AWAY.
//
// Test day 2026-11-18, ops tester: "Urgent · Competitor pricing summary" was
// raised over the LinkedIn thread at about 19:21. The tester went through
// five other threads, came back to LinkedIn at 19:29, and the mark was there
// again with a fresh 20 second clock (round-02 screens at lines 587 and 5735).
// Leaving the thread only hid it: `urgentShown` matched the thread again on
// the way back and the mark mounted anew. Leaving now drops it.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { urgentKept, urgentRaised } from '../renderer/src/urgent-arrival.ts';

const linkedin = { product: 'outreach', id: 'w-linkedin' };
const pricing = { product: 'outreach', id: 'w-pricing' };
const raised = urgentRaised(pricing as never, linkedin as never);

it('keeps the mark while its thread stays open', () => {
  expect(urgentKept(raised, linkedin)).toBe(raised);
});

it('drops the mark once another thread is open, or none', () => {
  expect(urgentKept(raised, { product: 'outreach', id: 'w-spring' })).toBeNull();
  expect(urgentKept(raised, { product: 'research', id: 'w-linkedin' })).toBeNull();
  expect(urgentKept(raised, null)).toBeNull();
});

it('has nothing to keep when nothing was raised', () => {
  expect(urgentKept(null, linkedin)).toBeNull();
});

it('the window drops it as the open thread changes', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  expect(app).toMatch(/useEffect\(\(\) => \{ setUrgentReady\(\(r\) => urgentKept\(r, focused\)\); \}, \[focused\]\);/);
});
