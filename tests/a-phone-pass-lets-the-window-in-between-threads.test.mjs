// A PHONE PASS LETS THE WINDOW IN BETWEEN THREADS, NOT ONLY BETWEEN PROJECTS.
//
// What broke (2026-10-19): typing in the app hitched every minute or so. A
// ten-minute CPU profile of the running app had 11 stretches of 400 to 560 ms
// with no idle in them, all in `publish` (main/phone-inbox.mjs): for each of
// up to 300 threads of a project it read the history, hashed it and looked
// for the files the thread names, and only waited for the window between
// projects. One big project was one block.
//
// Now the pass gives the window a turn every few threads, so a callback the
// window queued runs long before the pass is through a project.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox } from '../main/phone-inbox.mjs';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

const NOW = Date.parse('2026-10-19T12:00:00Z');
function inbox(threads, { onFirstRead = () => {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-turns-'));
  dirs.push(root);
  const cloud = createMemoryCloud();
  cloud.now = () => NOW;
  const me = signUpMemory(cloud, { email: `owner-${Math.random()}@example.com` });
  let read = 0;
  const items = Array.from({ length: threads }, (_, i) => ({ id: `w-${String(i).padStart(10, '0')}`, title: `Thread ${i}`, status: 'open', updatedAt: NOW - 1000, createdAt: NOW - 5000 }));
  const box = createPhoneInbox({
    backend: memoryBackend(cloud, me),
    owner: me.id,
    projects: () => [{ slug: 'alpha', name: 'Alpha' }],
    listItems: () => items,
    historyOf: () => { read += 1; if (read === 1) onFirstRead(); return []; },
    apply: async () => {},
    stateFile: path.join(root, 'phone-inbox.json'),
    now: () => NOW,
  });
  return { box, read: () => read };
}

describe('a pass over a project of 300 threads', () => {
  it('lets a callback the window queued at its first thread run before it is a sixth of the way through', async () => {
    let ranAt = null;
    const t = inbox(300, { onFirstRead: () => setImmediate(() => { ranAt = t.read(); }) });
    await t.box.syncOnce();
    expect(ranAt).not.toBeNull();
    expect(ranAt).toBeLessThan(50);
    expect(t.read()).toBe(300);
  });

  it('still sends every thread', async () => {
    const t = inbox(300);
    expect((await t.box.syncOnce()).sent).toBe(300);
  });
});
