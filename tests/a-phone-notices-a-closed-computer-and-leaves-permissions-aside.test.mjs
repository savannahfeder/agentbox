// QA found stale online claims and permission cards covering every phone screen.
// Exercise the expiry boundaries and pin the heartbeat and minimize controls.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox } from '../main/phone-inbox.mjs';
import { computerSays, phoneStatusLine } from '../renderer/src/phone-rows';
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const now = 1_000_000;
it('expires online status after ninety seconds, including after a reload', () => {
  for (const age of [89_999, 90_000]) expect(computerSays({ seenAt: now - age, cloud: false }, now).label).toBe('Your computer is online');
  for (const age of [90_001, 240_000]) {
    expect(computerSays({ seenAt: now - age, cloud: false }, now).desc).toContain('waits');
    expect(phoneStatusLine({ error: null, fetchedAt: now, macSeen: now - age }, now)).toContain('waits');
  }
  expect(computerSays({ seenAt: 0, cloud: false }, now).label).toBe('No computer connected yet');
  expect(phoneStatusLine({ error: 'offline', fetchedAt: now, macSeen: now }, now)).toContain("Can't reach");
});
it('renews presence well before the expiry', () => {
  expect(read('../main/phone-inbox.mjs')).toMatch(/const HEARTBEAT_MS = 30_000;/);
});
it('renews a quiet project every thirty seconds without rewriting threads', async () => {
  let clock = now;
  const cloud = createMemoryCloud();
  cloud.now = () => clock;
  const me = signUpMemory(cloud, { email: 'phone-test@example.com' });
  const backend = memoryBackend(cloud, me);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-presence-'));
  const inbox = createPhoneInbox({ backend, projects: () => [{ slug: 'demo', name: 'Demo' }], listItems: () => [], historyOf: () => [], apply: async () => {}, stateFile: path.join(dir, 'state.json'), now: () => clock });
  try {
    await inbox.syncOnce();
    const stamp = async () => (await backend.phoneProjects())[0].updatedAt;
    expect(await stamp()).toBe(clock);
    clock += 29_999;
    await inbox.syncOnce();
    expect(await stamp()).toBe(now);
    clock += 1;
    await inbox.syncOnce();
    expect(await stamp()).toBe(clock);
    clock += 30_001;
    await inbox.syncOnce();
    expect(await stamp()).toBe(clock);
    expect(await backend.phoneThreads()).toEqual([]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
it('can minimize a phone card without answering it and review it again', () => {
  const app = read('../renderer/src/App.tsx');
  expect(app).toContain('setMinimizedApproval(a.id)');
  expect(app).toContain('setMinimizedApproval(null)');
  expect(app).toContain('Review permission');
});
it('shows the waiting warning beside new threads and replies too', () => {
  const app = read('../renderer/src/App.tsx');
  expect(app.includes('statusLine={snap.phoneStatus}')).toBe(true);
  expect(app.includes('aboveDock={<>{snap.phoneStatus')).toBe(true);
  expect(read('../renderer/src/phone.css').includes('.tc-connection-status { order: 2;')).toBe(true);
});
