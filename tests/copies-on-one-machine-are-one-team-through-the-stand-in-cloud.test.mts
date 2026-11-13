// COPIES ON ONE MACHINE ARE ONE TEAM THROUGH THE STAND-IN CLOUD.
//
// Why: trying a team on one machine takes one copy of the app per person, and
// the hosted database must not carry those experiments. The first version of
// this lived in a cloud sandbox and rewrote a 48 MB file on every change, which
// stalled all four copies, so a save here must not rewrite a big file twice.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startStandinCloud, pack, unpack } from '../cloud/standin/server.mjs';
import { standinSession } from '../main/team/standin-backend.mts';
import { supabaseSession } from '../main/team/session.mts';

const stops = [];
afterEach(async () => { while (stops.length) await stops.pop()(); });
const up = async (o = {}) => { const c = await startStandinCloud(o); stops.push(c.stop); return c; };
const person = (url, name) => standinSession({ cloudConfig: { url }, testLogin: `${name}@lumen.test:x` }).restore();
const until = async (fn) => { for (let i = 0; i < 100; i++) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 30)); } return false; };

describe('the stand-in team cloud', () => {
  it('makes two sign-ins two people on one team, by invitation', async () => {
    const { url } = await up();
    const maya = await person(url, 'maya');
    const dev = await person(url, 'dev');
    expect(maya.personId).not.toBe(dev.personId);
    const team = await maya.createTeam('Lumen');
    await maya.invite(team.id, 'dev@lumen.test');
    expect((await dev.pendingInvites()).length).toBe(1);
    await dev.acceptInvite(team.id);
    expect((await maya.teamPeople(team.id)).map((p) => p.name).sort()).toEqual(['Dev', 'Maya']);
  });

  it('refuses what the cloud refuses, as an error with its words', async () => {
    const { url } = await up();
    const maya = await person(url, 'maya');
    const dev = await person(url, 'dev');
    const team = await maya.createTeam('Lumen');
    await expect(dev.renameTeam(team.id, 'Mine')).rejects.toThrow(/not allowed/);
  });

  // Two testers' chat messages read "auth-audit.md did not send" for a file
  // the room already held (2026-11-12): the wire dropped the error's code, so
  // "already here" read as a failure. The hosted cloud tells them apart.
  it('says a file is already in the room by the error\'s code, as the hosted cloud does', async () => {
    const { url } = await up();
    const maya = await person(url, 'maya');
    const room = await maya.createRoom({ name: 'Lumen', people: [] });
    const data = Buffer.from('# Audit').toString('base64');
    await maya.putRoomFile(room, 'abc123-audit.md', data);
    await expect(maya.putRoomFile(room, 'abc123-audit.md', data)).rejects.toMatchObject({ code: 'room-file-exists' });
    await expect(maya.putRoomFile(room, 'not a plain name/x', data)).rejects.not.toHaveProperty('code');
  });

  it('tells a listener about a change the other person made, and not a line of someone else\'s room', async () => {
    const { url } = await up();
    const maya = await person(url, 'maya');
    const dev = await person(url, 'dev');
    const outsider = await person(url, 'outsider');
    const team = await maya.createTeam('Lumen');
    await maya.invite(team.id, 'dev@lumen.test');
    await dev.acceptInvite(team.id);
    const room = await maya.createRoom({ name: 'Lumen', people: [dev.personId] });
    const heard = []; const outsiderHeard = []; let changes = 0;
    const offs = [
      dev.subscribeRooms((e) => heard.push(e)),
      outsider.subscribeRooms((e) => outsiderHeard.push(e)),
      dev.subscribe(() => { changes += 1; }),
    ];
    stops.push(async () => offs.forEach((f) => f()));
    await new Promise((r) => setTimeout(r, 60));
    await maya.sendRoomMessage(room, { body: 'Dev, can you look?' });
    expect(await until(() => heard.some((e) => e.kind === 'message' && e.message.body === 'Dev, can you look?'))).toBe(true);
    expect(outsiderHeard.some((e) => e.kind === 'message')).toBe(false);
    await maya.setStatus({ text: 'in the clinic' });
    expect(await until(() => changes > 0)).toBe(true);
  });

  it('comes back with its people after a restart, and keeps a big file out of the state it rewrites', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standin-'));
    const file = path.join(dir, 'cloud.json');
    const first = await startStandinCloud({ file, saveEveryMs: 60_000 });
    const maya = await person(first.url, 'maya');
    const team = await maya.createTeam('Lumen');
    const room = await maya.createRoom({ name: 'Lumen', people: [] });
    await maya.putRoomFile(room, 'film.mp4', Buffer.alloc(375_000, 7).toString('base64'));
    await first.stop();
    expect(fs.statSync(file).size).toBeLessThan(100_000);
    expect(fs.readdirSync(`${file}.blobs`).length).toBe(1);
    const second = await up({ file });
    const again = await person(second.url, 'maya');
    expect((await again.myTeams()).map((t) => t.id)).toEqual([team.id]);
    expect(String((await again.roomFile(room, 'film.mp4')) ?? '').length).toBe(500_000);
  });

  // A full disk killed the cloud after an hour and every group chat
  // read "fetch failed" until it ended.
  it('keeps answering when it cannot save, and saves when it can again', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standin-'));
    const file = path.join(dir, 'cloud.json');
    const c = await up({ file, saveEveryMs: 60_000 });
    const maya = await person(c.url, 'maya');
    fs.mkdirSync(`${file}.${process.pid}.tmp`);
    expect(() => c.save()).not.toThrow();
    expect(fs.existsSync(file)).toBe(false);
    expect((await maya.createTeam('Lumen')).name).toBe('Lumen');
    fs.rmSync(`${file}.${process.pid}.tmp`, { recursive: true, force: true });
    c.save();
    expect(fs.existsSync(file)).toBe(true);
  });

  it('packs Maps and Sets and gives them back', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standin-'));
    const v = { a: new Map([['x', { y: new Set([1, 2]) }]]), n: null, list: [1, 'two'] };
    expect(unpack(JSON.parse(JSON.stringify(pack(v, dir))), dir)).toEqual(v);
  });
});

describe('who may use it', () => {
  it('a checkout pointed at it gets the stand-in session', () => {
    const s = supabaseSession({ cloudConfig: { url: 'http://127.0.0.1:1', anonKey: 'x', standin: true }, packaged: false, testLogin: 'maya@lumen.test:x' });
    expect(s.configured).toBe(true);
    expect(s.signIn.toString()).toMatch(/no Google sign-in/);
  });

  it('an installed build never does', () => {
    const s = supabaseSession({ cloudConfig: { url: 'http://127.0.0.1:1', anonKey: 'x', standin: true }, packaged: true });
    expect(s.signIn.toString()).not.toMatch(/no Google sign-in/);
  });
});
