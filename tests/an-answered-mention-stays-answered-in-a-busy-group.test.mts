// AN ANSWERED MENTION STAYS ANSWERED IN A BUSY GROUP (2026-11-21).
//
// Maya wrote "@Dev can you look at the bug?" and Dev answered "On it"; the row
// left Dev's Needs you. After 200 more messages in the group (status lines,
// agents posting), it came back: the app holds a group's newest 200 messages
// but loads your 50 newest mentions apart from them, so Dev's answer had
// scrolled out of view while the mention had not. Found by a code review of
// the team features; reproduced on the in-memory cloud. Your own newest
// messages are now loaded the same way, so the answer still counts.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createRooms, roomPrefsFile } from '../main/team/rooms.mts';

const T0 = Date.UTC(2026, 9, 30, 9);
const flush = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r)); };
const timers = { setTimeout: (fn: any) => { const h = { off: false }; queueMicrotask(() => { if (!h.off) fn(); }); return h; }, clearTimeout: (h: any) => { if (h) h.off = true; } } as any;
function world() {
  const cloud: any = createMemoryCloud();
  let clock = T0;
  cloud.now = () => clock;
  const mk = (name: string, email: string) => {
    const id = signUpMemory(cloud, { email, name });
    const backend = memoryBackend(cloud, id);
    const p: any = { id, name, backend, teamState: { team: null, people: [], cards: [] } };
    p.prefsFile = roomPrefsFile(fs.mkdtempSync(path.join(os.tmpdir(), 'rooms-probe-')));
    p.make = () => createRooms({
      backend: () => backend as any, me: () => ({ id, name, avatarUrl: null, status: null }), team: () => p.teamState, enabled: () => true,
      device: () => '0123456789ab', presenceFacts: () => ({ running: [], items: [], products: [], summary: null }),
      prefsFile: p.prefsFile, now: () => clock, timers,
    });
    p.rooms = p.make();
    return p;
  };
  return { cloud, maya: mk('Maya', 'maya@lumen.test'), dev: mk('Dev', 'dev@lumen.test'), tick: (ms = 60_000) => { clock += ms; } };
}

it('an answered mention stays answered after a busy afternoon in the group', async () => {
  const w = world();
  await w.maya.rooms.start(); await w.dev.rooms.start();
  const room = await w.maya.backend.createRoom({ name: 'Lumen' });
  await w.maya.rooms.refresh();
  await w.maya.rooms.invite(room, 'dev@lumen.test');
  await w.dev.rooms.refresh();
  await w.dev.rooms.acceptInvite(room);
  await w.maya.rooms.refresh();
  await flush();
  await w.maya.rooms.send(room, '@Dev can you look at the bug?', { mentions: [w.dev.id] });
  await flush();
  expect(w.dev.rooms.state().mentions).toHaveLength(1);
  w.tick();
  await w.dev.rooms.send(room, 'On it');
  expect(w.dev.rooms.state().mentions).toEqual([]);
  for (let i = 0; i < 200; i += 1) { if (i % 15 === 0) w.tick(); await w.maya.rooms.send(room, 'status line ' + i); }
  await flush();
  await w.dev.rooms.refresh();
  expect(w.dev.rooms.state().mentions).toEqual([]);
});
