// A TEAMMATE'S THREAD MADE PRIVATE CLOSES, WITH ANY FILE OF IT OPEN (w-d19fcb9309).
//
// The second synthetic team run, Maya, twice: after Theo made a thread Private,
// its attachment still opened from her copy. Her copy deletes the thread's
// folder once its card is gone, but the page and a file opened from it stayed
// on screen. Now the page closes, the file with it, and a line says why.
//
// And "Tell me when it is done" went quiet for Theo: his tester copy was
// restarted on a new port, a new browser origin, so the threads he followed
// were gone from its storage. A restarted copy keeps its port.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { sharedThreadOfDoc } from '../renderer/src/threads/share-rules.ts';

const card = { personId: 'p-theo', threadId: 'w-1' };

describe('a file of a teammate\'s thread', () => {
  it('is known by its thread\'s own folder', () => {
    expect(sharedThreadOfDoc('shared-thread:p-theo:w-1', card)).toBe(true);
  });
  it('is not a file of another thread, another teammate, or a project of yours', () => {
    expect(sharedThreadOfDoc('shared-thread:p-theo:w-2', card)).toBe(false);
    expect(sharedThreadOfDoc('shared-thread:p-jun:w-1', card)).toBe(false);
    expect(sharedThreadOfDoc('website', card)).toBe(false);
    expect(sharedThreadOfDoc(null, card)).toBe(false);
  });
  it('matches the folder the sync names', () => {
    const share = fs.readFileSync(new URL('../main/team/thread-share.mts', import.meta.url), 'utf8');
    expect(share).toContain("const SHARED_PREFIX = 'shared-thread';");
    expect(share).toContain('const slugOf = (owner: string, threadId: string) => `${SHARED_PREFIX}:${owner}:${threadId}`;');
  });
});

describe('the window', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('closes a teammate\'s thread once it leaves the team\'s list, and the file open from it', () => {
    expect(app).toMatch(/if \(!openCardListed\.current\) return;\n\s+openCardListed\.current = false;\n\s+setOpenDoc\(\(d\) => \(d && sharedThreadOfDoc\(d\.product, openCard\) \? null : d\)\);\n\s+setOpenCard\(null\);/);
    expect(app).toContain('no longer shares that thread with you.');
  });
  it('leaves a room-mate\'s card alone, which was never on the team\'s list', () => {
    expect(app).toMatch(/if \(listed\) \{ openCardListed\.current = true; return; \}/);
  });
});

describe('a restarted test copy', () => {
  it('asks for the port it had, and takes a new one only if that is gone', () => {
    const live = fs.readFileSync(new URL('../.claude/skills/verify-agentbox/scripts/live.mjs', import.meta.url), 'utf8');
    expect(live).toContain("const kept = state.url ? new URL(state.url).port : '';");
    expect(live).toContain("...(port ? ['--port', port] : [])");
    expect(live).toContain("if (!url && kept && !alive(child.pid)) ({ child, found: url } = await launch(''));");
  });
});
