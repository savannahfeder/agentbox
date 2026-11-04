// TWO COMPUTERS SEE THE SAME NUMBER FOR THE SAME VERSION.
//
// All three people saw it first: one seat picker was "v5" to Sofia's
// agent, "v6 of 6" then "v8 of 8" in her viewer, and "-v7.png" then "-v9.png"
// in Dev's copy; her v6 was his v7. Measured from the code: every copy of the
// app numbered a file's versions itself, from the threads it happened to be
// able to read, so two computers with different threads counted differently.
// The team cloud now holds one line per file and gives each new set of bytes
// the next number; a computer only asks, never counts.
import { describe, it, expect, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, memoryBackend, signUpMemory } from '../main/team/memory-cloud.mts';
import { versionLine } from '../main/version-line.mjs';
import { startStandinCloud } from '../cloud/standin/server.mjs';
import { standinBackend } from '../main/team/standin-backend.mjs';

const tmp = (what) => fs.mkdtempSync(path.join(os.tmpdir(), `line-${what}-`));
const put = (dir, name, bytes) => { const f = path.join(dir, name); fs.writeFileSync(f, bytes); return f; };
const FILE = 'lumen app\0group-seat-picker\0image';

function aTeam(cloud) {
  const maya = signUpMemory(cloud, { email: 'maya@example.test', name: 'Maya' });
  const dev = signUpMemory(cloud, { email: 'dev@example.test', name: 'Dev' });
  const teamId = crypto.randomUUID();
  cloud.teams.set(teamId, { id: teamId, name: 'Lumen', createdBy: maya, made: 1 });
  cloud.members.push({ teamId, personId: maya, role: 'owner' }, { teamId, personId: dev, role: 'member' });
  return { teamId, maya, dev };
}
const linkTo = (backend, teamId) => () => ({
  append: (row) => backend.addFileVersion(teamId, row),
  read: () => backend.fileVersions(teamId),
});

async function sameNumbers(backendOf) {
  const sofiaDisk = tmp('sofia');
  const devDisk = tmp('dev');
  const sofia = versionLine({ dir: tmp('sofia-line'), cloud: backendOf('maya') });
  const dev = versionLine({ dir: tmp('dev-line'), cloud: backendOf('dev') });
  const one = await sofia.add({ file: FILE, src: put(sofiaDisk, 'group-seat-picker.png', 'one'), name: 'group-seat-picker.png' });
  const two = await sofia.add({ file: FILE, src: put(sofiaDisk, 'group-seat-picker-v5.png', 'two'), name: 'group-seat-picker-v5.png' });
  // Dev's copy of v2 is named after his own count, as it was in use.
  const devsTwo = await dev.add({ file: FILE, src: put(devDisk, 'group-seat-picker-v7.png', 'two'), name: 'group-seat-picker-v7.png' });
  const three = await dev.add({ file: FILE, src: put(devDisk, 'group-seat-picker-v9.png', 'three'), name: 'group-seat-picker-v9.png' });
  await sofia.refresh();
  await dev.refresh();
  return { one, two, devsTwo, three, sofia: sofia.of(FILE), dev: dev.of(FILE) };
}

const stops = [];
afterEach(async () => { while (stops.length) await stops.pop()(); });

describe('one line per file, held by the team cloud', () => {
  it('gives the same bytes the same number on both computers, whatever each names them', async () => {
    const cloud = createMemoryCloud();
    const t = aTeam(cloud);
    const got = await sameNumbers((who) => linkTo(memoryBackend(cloud, t[who]), t.teamId));
    expect([got.one.n, got.two.n, got.devsTwo.n, got.three.n]).toEqual([1, 2, 2, 3]);
    expect(got.sofia.map((v) => [v.n, v.hash])).toEqual(got.dev.map((v) => [v.n, v.hash]));
    expect(got.sofia).toHaveLength(3);
  });

  it('numbers a version made on the other computer, which this one has no bytes of', async () => {
    const cloud = createMemoryCloud();
    const t = aTeam(cloud);
    const got = await sameNumbers((who) => linkTo(memoryBackend(cloud, t[who]), t.teamId));
    expect(got.sofia.at(-1)).toMatchObject({ n: 3 });
    expect(got.sofia.at(-1).kept).toBeUndefined();
  });

  it('holds over the stand-in cloud, too', async () => {
    const started = await startStandinCloud();
    stops.push(started.stop);
    const t = aTeam(started.cloud);
    const signIn = async (personId) => {
      const backend = memoryBackend(started.cloud, personId);
      const methods = Object.keys(backend).filter((k) => typeof backend[k] === 'function' && !k.startsWith('subscribe'));
      return standinBackend(started.url, { token: personId, personId, kind: 'standin', methods });
    };
    const backends = { maya: await signIn(t.maya), dev: await signIn(t.dev) };
    const got = await sameNumbers((who) => linkTo(backends[who], t.teamId));
    expect([got.one.n, got.two.n, got.devsTwo.n, got.three.n]).toEqual([1, 2, 2, 3]);
    expect(got.dev.map((v) => v.n)).toEqual([1, 2, 3]);
  });

  it('keeps a file of another team out of reach', async () => {
    const cloud = createMemoryCloud();
    const t = aTeam(cloud);
    const stranger = signUpMemory(cloud, { email: 'x@example.test', name: 'X' });
    await memoryBackend(cloud, t.maya).addFileVersion(t.teamId, { file: 'ab12cd34', hash: 'a'.repeat(64), name: 'ab12cd34', at: 1 });
    await expect(memoryBackend(cloud, stranger).addFileVersion(t.teamId, { file: 'ab12cd34', hash: 'b'.repeat(64), name: 'ab12cd34', at: 1 })).rejects.toThrow();
    expect(await memoryBackend(cloud, stranger).fileVersions(t.teamId)).toEqual([]);
  });
});

describe('with no team', () => {
  it('this computer holds the line itself, one number per set of bytes', async () => {
    const disk = tmp('solo');
    const line = versionLine({ dir: tmp('solo-line') });
    const a = await line.add({ file: FILE, src: put(disk, 'a.png', 'one'), name: 'a.png' });
    const again = await line.add({ file: FILE, src: put(disk, 'a-copy.png', 'one'), name: 'a-copy.png' });
    const b = await line.add({ file: FILE, src: put(disk, 'a-v2.png', 'two'), name: 'a-v2.png' });
    expect([a.n, again.n, b.n]).toEqual([1, 1, 2]);
  });

  it('keeps its numbers and the old bytes over a restart', async () => {
    const disk = tmp('restart');
    const dir = tmp('restart-line');
    const first = versionLine({ dir });
    const src = put(disk, 'deck.pdf', 'one');
    await first.add({ file: FILE, src, name: 'deck.pdf' });
    put(disk, 'deck.pdf', 'two');
    const again = versionLine({ dir });
    expect((await again.add({ file: FILE, src, name: 'deck.pdf' })).n).toBe(2);
    expect(fs.readFileSync(again.of(FILE)[0].kept, 'utf8')).toBe('one');
  });

  it('a file of no bytes is no version', async () => {
    const line = versionLine({ dir: tmp('none-line') });
    expect(await line.add({ file: FILE, src: path.join(tmp('none'), '-390.png'), name: '-390.png' })).toBeNull();
    expect(line.of(FILE)).toEqual([]);
  });
});
