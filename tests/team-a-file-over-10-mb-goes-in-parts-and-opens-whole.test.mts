// A FILE OVER 10 MB GOES IN PARTS AND OPENS WHOLE FOR THE READER.
//
// A 20 second cut of the launch film is 10.6 MB, and a message
// carried 10. "mvv1c1te-98cm96-launch-cut-v2.mp4 is 10.6 MB, over the 10 MB a
// message can carry. Only the person who sent it can open it." Film review, the
// thing the team wanted the app for, failed on the first real cut. Measured:
// 0 of 1 cuts over 10 MB reached anyone.
//
// Now a big file goes up in parts of 8 MB (each under the 10 MB check, named so
// the cloud's checks pass; since 2026-11 into the storage bucket, see
// team-a-film-up-to-1-gb-goes-to-a-teammate-and-plays), the reader puts it
// together and checks it before it shows, and the tile says how far it has
// come. Over the limit is refused, and the composer says so before anything is
// sent.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { aMac, aProject, conversation, createMemoryCloud, disk, memoryBackend, opened, signUpMemory, until, write } from './lib/two-macs-over-one-cloud.mts';
import { MAX_CARRIED_BYTES, MAX_SENT_BYTES, PART_BYTES, carryLine, overTheLimit, tooBigToSend } from '../shared/carried-files.mts';
import { pieceSizes } from '../main/team/carry-files.mts';

const MB = 1024 * 1024;
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

let cloud, maya, dev, mine, gate;
const say = async (words, { as = maya } = {}) => {
  await as.on(() => as.service.message(dev.personId, words));
};

beforeEach(async () => {
  disk._internals.forgetFolds();
  gate = { putAfter: Infinity, putOpen: null, getAfter: Infinity, getOpen: null, puts: 0, gets: 0 };
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }), {
    wrap: (b) => ({ ...b, personId: b.personId, putPiece: async (...a) => { if (gate.puts >= gate.putAfter) await gate.putOpen; gate.puts += 1; return b.putPiece(...a); } }),
  });
  dev = await aMac(cloud, signUpMemory(cloud, { email: 'dev@nw.test', name: 'Dev Rao' }), {
    wrap: (b) => ({ ...b, personId: b.personId, getPiece: async (...a) => { if (gate.gets >= gate.getAfter) await gate.getOpen; gate.gets += 1; return b.getPiece(...a); } }),
  });
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('dev@nw.test');
  await dev.service.signIn();
  await dev.service.acceptInvite(maya.service.state().team.id);
  mine = aProject(maya, 'Film');
  await maya.on(() => maya.service.message(dev.personId, 'Morning!'));
  await maya.service.syncNow();
  await dev.service.syncNow();
});
afterEach(async () => { for (const m of [maya, dev]) { await m.service.signOut(); } });

describe('a cut over 10 MB', () => {
  it('opens whole for the reader, byte for byte, and every part passes the cloud checks', async () => {
    const film = crypto.randomBytes(20 * MB + 12345);
    write(mine.dir, 'cuts/launch-cut-v2.mp4', film);
    await say('Cut 2 is [launch-cut-v2.mp4](cuts/launch-cut-v2.mp4)');
    expect(await until([maya, dev], async () => (await opened(dev, 'cuts/launch-cut-v2.mp4')).ok)).toBe(true);
    const there = await opened(dev, 'cuts/launch-cut-v2.mp4');
    expect(sha(fs.readFileSync(there.path))).toBe(sha(film));
    const parts = [...cloud.pieces.values()];
    expect(parts.length).toBe(3);
    for (const f of parts) {
      expect(f.name).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/);
      expect(f.bytes.length).toBeLessThanOrEqual(PART_BYTES);
    }
    // No pieces are left lying about once it is whole.
    const folder = path.dirname(there.path);
    expect(fs.existsSync(path.join(path.dirname(folder), '.chunks')) ? fs.readdirSync(path.join(path.dirname(folder), '.chunks')) : []).toEqual([]);
  });

  it('opens for the sender at once, with Sent when it is up', async () => {
    write(mine.dir, 'cuts/c.mp4', crypto.randomBytes(11 * MB));
    await say('[c](cuts/c.mp4)');
    expect(await until([maya, dev], async () => (await opened(maya, 'cuts/c.mp4')).carry?.state === 'sent')).toBe(true);
    expect((await opened(maya, 'cuts/c.mp4')).ok).toBe(true);
  });

  it('shows the sender how far it has gone, and does not hold the other messages up', async () => {
    write(mine.dir, 'cuts/c.mp4', crypto.randomBytes(20 * MB));
    let release;
    gate.putOpen = new Promise((r) => { release = r; });
    gate.putAfter = 1;
    await say('[c](cuts/c.mp4)');
    await maya.service.syncNow();
    await new Promise((r) => setTimeout(r, 100));
    const going = await opened(maya, 'cuts/c.mp4');
    expect(going.ok).toBe(true);
    expect(going.carry).toMatchObject({ state: 'coming', mine: true, done: 1, total: 3 });
    expect(carryLine(going.carry).label).toBe('On its way, 33%');
    // A message written while the film goes up still goes.
    await say('and one more thing');
    await maya.service.syncNow();
    await dev.service.syncNow();
    expect(disk.readWorkItems(conversation(dev).dir).some((i) => JSON.stringify(i).includes('one more thing'))).toBe(true);
    release();
    expect(await until([maya, dev], async () => (await opened(maya, 'cuts/c.mp4')).carry?.state === 'sent')).toBe(true);
  });

  it('shows the reader how far it has come, and shows it whole only when it is', async () => {
    write(mine.dir, 'cuts/c.mp4', crypto.randomBytes(20 * MB));
    // The reader's copy syncs by itself when the cloud changes, so the gate goes up first.
    let release;
    gate.getOpen = new Promise((r) => { release = r; });
    gate.getAfter = 1;
    await say('[c](cuts/c.mp4)');
    await until([maya], async () => (await opened(maya, 'cuts/c.mp4')).carry?.state === 'sent');
    await new Promise((r) => setTimeout(r, 200));
    const coming = await opened(dev, 'cuts/c.mp4');
    expect(coming.ok).toBe(false);
    expect(coming.coming).toBe(true);
    expect(coming.carry).toMatchObject({ state: 'coming', done: 1, total: 3 });
    release();
    expect(await until([dev], async () => (await opened(dev, 'cuts/c.mp4')).ok)).toBe(true);
  });

  it('opens an attachment over 10 MB, which today says only the sender can', async () => {
    const dir = conversation(maya).dir;
    const film = crypto.randomBytes(12 * MB);
    write(dir, 'attachments/k3-cut.mov', film);
    await say('[cut](attachments/k3-cut.mov)');
    expect(await until([maya, dev], async () => (await opened(dev, 'attachments/k3-cut.mov')).ok)).toBe(true);
    expect(sha(fs.readFileSync((await opened(dev, 'attachments/k3-cut.mov')).path))).toBe(sha(film));
  });

  it('says it is damaged, once and for good, when the parts do not make the file that was named', async () => {
    write(mine.dir, 'cuts/c.mp4', crypto.randomBytes(11 * MB));
    let release;
    gate.getOpen = new Promise((r) => { release = r; });
    gate.getAfter = 0;
    await say('[c](cuts/c.mp4)');
    await until([maya], async () => (await opened(maya, 'cuts/c.mp4')).carry?.state === 'sent');
    // Swap a stored part for other bytes under a name that still reads as its own.
    for (const f of cloud.pieces.values()) if (/p2of2$/.test(f.name)) f.bytes = Buffer.from('not the film');
    release();
    expect(await until([dev], async () => (await opened(dev, 'cuts/c.mp4')).carry?.state === 'failed', { passes: 60 })).toBe(true);
    const r = await opened(dev, 'cuts/c.mp4');
    expect(r.ok).toBe(false);
    expect(carryLine(r.carry).label).toBe('Not delivered: it arrived damaged');
  });

  it('is told Not delivered, with Try again, when the cloud takes a part and then refuses the rest', async () => {
    write(mine.dir, 'cuts/c.mp4', crypto.randomBytes(20 * MB));
    gate.putOpen = Promise.reject(new Error('offline'));
    gate.putOpen.catch(() => {});
    gate.putAfter = 1;
    await say('[c](cuts/c.mp4)');
    expect(await until([maya], async () => (await opened(maya, 'cuts/c.mp4')).carry?.state === 'failed')).toBe(true);
    const failed = await opened(maya, 'cuts/c.mp4');
    expect(failed.ok).toBe(true);
    expect(carryLine(failed.carry)).toMatchObject({ retry: true, label: 'Not delivered: the cloud could not be reached' });
    gate.putAfter = Infinity;
    expect(await maya.service.retryFile({ product: conversation(maya).slug, src: 'cuts/c.mp4' })).toBe(true);
    expect(await until([maya, dev], async () => (await opened(dev, 'cuts/c.mp4')).ok)).toBe(true);
  });
});

describe('the limits', () => {
  it('cuts a file into parts of 8 MB at most, without reading it', () => {
    expect(pieceSizes(MAX_CARRIED_BYTES + 1).length).toBe(2);
    expect(pieceSizes(PART_BYTES)).toEqual([PART_BYTES]);
    expect(pieceSizes(PART_BYTES + 1)).toEqual([PART_BYTES, 1]);
  });

  it('is said in the composer, before sending: the limit is fine and one byte over is not', () => {
    expect(tooBigToSend(MAX_SENT_BYTES)).toBe(false);
    expect(tooBigToSend(MAX_SENT_BYTES + 1)).toBe(true);
    expect(overTheLimit(1300 * MB)).toBe('1.3 GB is over the 1 GB a message can send. Send a smaller copy, or share a link.');
    const row = fs.readFileSync(path.resolve('renderer/src/components/AttachRow.tsx'), 'utf8');
    expect(row).toMatch(/tooBigToSend/);
    const staged = fs.readFileSync(path.resolve('renderer/src/attachments.ts'), 'utf8');
    expect(staged).toMatch(/size: file\.size/);
  });

  it('keeps a file of exactly 10 MB in one piece', async () => {
    write(mine.dir, 'cuts/edge.mp4', crypto.randomBytes(MAX_CARRIED_BYTES));
    await say('[edge](cuts/edge.mp4)');
    expect(await until([maya, dev], async () => (await opened(dev, 'cuts/edge.mp4')).ok)).toBe(true);
    expect([...cloud.files.values()].map((f) => f.name).join(' ')).not.toMatch(/\.p1of/);
    expect(cloud.files.size).toBe(1);
  });

  it('never lets a teammate\'s list name more than 200 MB or a part over 10 MB', async () => {
    const convo = conversation(dev);
    const asMaya = memoryBackend(cloud, maya.personId);
    const line = (uid, parts) => ({ id: disk.readWorkItems(convo.dir)[0].id, ts: 1, source: 'system', by: maya.personId, uid, patch: { carries: [{ ref: 'x.mp4', main: 'x.mp4', parts }] } });
    await asMaya.pushLines(convo.team.projectId, [
      line('forged-1', [{ path: 'x.mp4', cloud: 'abcabcabcabc-x.mp4', size: MAX_SENT_BYTES + 1, chunks: [{ cloud: 'abcabcabcabc-x.mp4.p1of1', size: 100 }] }]),
      line('forged-2', [{ path: 'x.mp4', cloud: 'abcabcabcabc-x.mp4', size: 100, chunks: [{ cloud: 'abcabcabcabc-x.mp4.p1of1', size: MAX_CARRIED_BYTES + 1 }] }]),
      line('forged-3', [{ path: 'x.mp4', cloud: 'abcabcabcabc-x.mp4', size: 100, chunks: [{ cloud: '../../evil', size: 100 }] }]),
    ]);
    await dev.service.syncNow();
    expect((await opened(dev, 'x.mp4')).ok).toBe(false);
    expect((await opened(dev, 'x.mp4')).carry?.state).not.toBe('sent');
  });
});
