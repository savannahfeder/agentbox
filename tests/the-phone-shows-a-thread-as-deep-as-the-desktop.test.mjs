// THE PHONE SHOWS A THREAD AS DEEP AS THE DESKTOP, AND TELLS TWO COMPUTERS APART.
//
// What broke (found reading the code, 2026-10-19):
// - a thread's copy for the phone carried its last 120 lines, read from the
//   last 120 ledger lines, claims and heartbeats among them, so a working
//   thread showed far fewer and never knew older ones existed; the desktop
//   shows 400;
// - two computers with a project of the same name drew two identical names in
//   the list and the project picker;
// - a close or snooze sent as the page was hidden used a plain request, which
//   iOS may freeze before it lands.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { SNAPSHOT_LIMITS, threadSnapshot } from '../shared/phone-snapshot.mjs';
import { phoneView } from '../renderer/src/cloud-bridge';

describe('a thread\'s copy', () => {
  it('carries as many lines as the desktop draws, and says how many older ones there are', () => {
    expect(SNAPSHOT_LIMITS.lines).toBe(400);
    const lines = Array.from({ length: 450 }, (_, i) => ({ ts: i, source: 'agent', patch: { result: `line ${i}` } }));
    const snap = threadSnapshot({ id: 'w-1', title: 'T', status: 'open', updatedAt: 1 }, lines);
    expect(snap.history).toHaveLength(400);
    expect(snap.olderLines).toBe(50);
  });

  it('is read from enough of the ledger that claims and heartbeats do not eat it', () => {
    const src = fs.readFileSync(new URL('../main/team/index.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/max: all \? Number\.MAX_SAFE_INTEGER : SNAPSHOT_LIMITS\.lines \* 4/);
  });
});

describe('two computers', () => {
  it('each with a project of the same name, drawn so she can tell which is which', () => {
    const v = phoneView({ projects: [{ device: 'a1b2c3d4e5f6', project: 'site', name: 'Site' }, { device: '0f0e0d0c0b0a', project: 'site', name: 'Site' }, { device: 'a1b2c3d4e5f6', project: 'app', name: 'App' }], threads: [], commands: [] });
    expect(v.products.map((p) => p.name)).toEqual(['Site (a1b2)', 'Site (0f0e)', 'App']);
  });
});

describe('a command sent as the page hides', () => {
  it('goes as a request the browser finishes after the page is put away', () => {
    const src = fs.readFileSync(new URL('../renderer/src/cloud-rest.ts', import.meta.url), 'utf8');
    expect(src.match(/keepalive: true/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
