// A TEAM GETS ITS TEAM PAGE WITHOUT AN ALPHA SWITCH (w-1e52420829, 2026-11-11).
//
// What broke: the team layout (the Team entry, the Everyone feed, people,
// groups, Home's team card) waits on Rooms, and Rooms was off unless someone
// turned it on in Settings, Alpha features. A person on a three-person team
// saw no Team entry and no team card on Home until they found that switch.
// Nobody had noticed because the test harness wrote `alphaRooms: true` into
// every team copy it started.
//
// The first fix read a missing switch as on for everyone, which turned the
// team layout on for every person with no team: the Rooms service reports
// `on: enabled()` while it is not started, and the window takes that as team
// mode. Now a missing switch means on only for someone signed in and on a team,
// and main, the window and the phone read that through one rule.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { roomsOn, isOnTeam } from '../shared/rooms-on.mts';
import { alphaFeatures, setWorkspaceSetting } from '../main/settings.mts';
import { roomsSetup } from '../main/team/room-setup.mts';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

const read = (rel: string) => fs.readFileSync(path.join(import.meta.dirname, '..', rel), 'utf8');
const dirs: string[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rooms-default-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const ON_TEAM = { signedIn: true, team: { id: 't', name: 'Lumen' } };
const NO_TEAM = { signedIn: true, team: null };
const SIGNED_OUT = { signedIn: false, team: null };

const roomsService = (config: { alphaRooms?: boolean | null; alphaMultiplayer?: boolean }) => {
  const dir = tmp();
  return roomsSetup({ config: { storeRoot: dir, ...config }, store: { listProducts: () => [], readItem: () => null }, supervisor: { runsGoing: () => [] }, userDir: dir, log: () => {} });
};
// Rooms as main, the window's snapshot and Settings read it for one person.
const everywhere = (config: { alphaRooms?: boolean | null }, team: typeof ON_TEAM | typeof NO_TEAM) => {
  const onTeam = isOnTeam(team);
  return { rule: roomsOn({ saved: config.alphaRooms, onTeam }), service: roomsService(config).enabled({ onTeam }), window: alphaFeatures(config, { onTeam }).rooms };
};
const off = { rule: false, service: false, window: false };
const on = { rule: true, service: true, window: true };

describe('Rooms with nothing saved', () => {
  it('is off for someone signed out, as before', () => {
    expect(everywhere({}, SIGNED_OUT)).toEqual(off);
    expect(everywhere({ alphaRooms: null }, SIGNED_OUT)).toEqual(off);
    expect(alphaFeatures({}).rooms).toBe(false);
  });
  it('is off for someone signed in who is on no team, an invite pending or not', () => {
    expect(everywhere({}, NO_TEAM)).toEqual(off);
    expect(isOnTeam({ signedIn: false, team: { id: 't' } })).toBe(false);
  });
  it('is on for someone on a team', () => {
    expect(everywhere({}, ON_TEAM)).toEqual(on);
  });
  it('leaves every other alpha default as it was', () => {
    expect(alphaFeatures({}, { packaged: true })).toEqual({ rooms: false, teammates: false, multiplayer: true, glass: false });
    expect(alphaFeatures({}, { packaged: true, onTeam: true })).toEqual({ rooms: true, teammates: false, multiplayer: true, glass: false });
  });
});

describe('Rooms someone set', () => {
  it('saved on is on with no team, as it was for those who opted in', () => {
    expect(everywhere({ alphaRooms: true }, SIGNED_OUT)).toEqual(on);
    expect(everywhere({ alphaRooms: true }, NO_TEAM)).toEqual(on);
  });
  it('saved off stays off on a team', () => {
    expect(everywhere({ alphaRooms: false }, ON_TEAM)).toEqual(off);
  });
  it('unticking the switch saves a real false, so it stays off after a restart', () => {
    const dir = tmp();
    const world = { config: { appDir: dir } as Record<string, unknown>, supervisor: { onChange() {} }, store: {} };
    setWorkspaceSetting(world, { key: 'alphaRooms', value: false });
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'zero.config.json'), 'utf8'));
    expect(saved.alphaRooms).toBe(false);
    expect(alphaFeatures(saved, { onTeam: true }).rooms).toBe(false);
  });
});

describe('joining and leaving a team while the app runs', () => {
  const cloud = createMemoryCloud();
  // A Mac with nothing saved, whose cloud records what Rooms says of it.
  async function aMac(email: string, name: string, config: { alphaRooms?: boolean; alphaMultiplayer?: boolean } = {}) {
    const storeRoot = tmp();
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    fs.mkdirSync(accountRoot, { recursive: true });
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const id = signUpMemory(cloud, { email, name });
    const presence: string[] = [];
    const roomBits = {
      myRoomProfile: async () => ({ user_id: id, display_name: name }),
      saveRoomProfile: async (p: object) => ({ user_id: id, ...p }),
      subscribeRooms: () => () => {},
      myRooms: async () => [], roomProfiles: async () => [], roomPresence: async () => [], roomReads: async () => [],
      pendingRoomInvites: async () => [], agentboxRanks: async () => ({}), roomMentions: async () => [],
      putPresence: async (_device: string, row: { gone?: boolean }) => { presence.push(row.gone ? 'gone' : 'here'); },
    };
    const service = createTeamService({
      session: memorySession(() => Object.assign(memoryBackend(cloud, id), roomBits) as never),
      store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
      rooms: roomsSetup({ config: { storeRoot, ...config }, store, supervisor: { runsGoing: () => [] }, userDir: storeRoot, log: () => {} }),
    });
    // What the window reads: the snapshot's `alpha.rooms` (main/ipc.mts) and the service's `rooms.on`.
    const roomsShown = () => { const t = service.state(); return alphaFeatures(config, { onTeam: isOnTeam(t) }).rooms && !!t.rooms?.on; };
    return { service, presence, roomsShown };
  }

  it('starts Rooms at the next pass after joining, and stops it after leaving', async () => {
    const maya = await aMac('maya@lumen.test', 'Maya Chen');
    expect(maya.roomsShown()).toBe(false);
    await maya.service.signIn();
    await maya.service.syncNow();
    expect(maya.presence).toEqual([]);
    expect(maya.roomsShown()).toBe(false);

    await maya.service.createTeam('Lumen');
    await maya.service.syncNow();
    expect(maya.presence).toContain('here');
    expect(maya.roomsShown()).toBe(true);

    const dev = await aMac('dev@lumen.test', 'Dev Rao');
    await dev.service.signIn();
    await maya.service.invite('dev@lumen.test');
    await dev.service.syncNow();
    expect(dev.service.state().invites.length).toBe(1);
    expect(dev.presence).toEqual([]);
    expect(dev.roomsShown()).toBe(false);
    await dev.service.acceptInvite(maya.service.state().team!.id);
    await dev.service.syncNow();
    expect(dev.presence).toContain('here');
    expect(dev.roomsShown()).toBe(true);

    await maya.service.leaveTeam();
    await maya.service.syncNow();
    expect(maya.presence.at(-1)).toBe('gone');
    expect(maya.roomsShown()).toBe(false);

    await dev.service.signOut();
    expect(dev.presence.at(-1)).toBe('gone');
    expect(dev.roomsShown()).toBe(false);
  });

  it('never starts for someone on a team who turned Multiplayer off', async () => {
    const sam = await aMac('sam@solo.test', 'Sam Park', { alphaMultiplayer: false });
    await sam.service.signIn();
    await sam.service.createTeam('Solo');
    await sam.service.syncNow();
    await sam.service.syncNow();
    expect(isOnTeam(sam.service.state())).toBe(true);
    expect(sam.presence).toEqual([]);
    expect(sam.service.state().rooms?.on).toBe(false);
    await sam.service.signOut();
  });
});

describe('a person on a team with Multiplayer off', () => {
  it('gets no Rooms with nothing saved for it', () => {
    expect(alphaFeatures({ alphaMultiplayer: false }, { onTeam: true }).rooms).toBe(false);
    expect(roomsService({ alphaMultiplayer: false }).enabled({ onTeam: true })).toBe(false);
  });
  it('keeps Rooms they turned on themselves, as before', () => {
    expect(alphaFeatures({ alphaMultiplayer: false, alphaRooms: true }, { onTeam: true }).rooms).toBe(true);
    expect(roomsService({ alphaMultiplayer: false, alphaRooms: true }).enabled({ onTeam: true })).toBe(true);
  });
});

describe('where the window and the phone read it', () => {
  it('the snapshot and the settings model are given whether this person is on a team', () => {
    const ipc = read('main/ipc.mts');
    expect(ipc).toMatch(/const alpha = alphaFeatures\(config, \{ onTeam: onTeamNow\(\) \}\);/);
    expect(ipc).not.toMatch(/readSettings\(\{ config, supervisor, store \}/);
    expect(read('main/settings.mts')).toMatch(/alpha: alphaFeatures\(config, \{ onTeam: onTeam\?\.\(\) \?\? false \}\)/);
  });
});

describe('a team test copy', () => {
  it('saves no Rooms switch, as a real install has none', async () => {
    const { copyConfig } = await import('../.claude/skills/verify-agentbox/scripts/live.mjs');
    expect(copyConfig({ storeRoot: '/s', teamFile: '/t/team.config.json' })).not.toHaveProperty('alphaRooms');
    expect(copyConfig({ storeRoot: '/s', teamFile: '/t/team.config.json', alpha: ['rooms'] })).toMatchObject({ alphaRooms: true });
  });
});
