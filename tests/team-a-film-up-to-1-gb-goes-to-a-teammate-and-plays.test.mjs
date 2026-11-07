// A FILM UP TO 1 GB GOES TO A TEAMMATE AND PLAYS IN THE MESSAGE.
//
// A teammate asked for the original launch films. The Oct 7 intro is 625 MB
// (1920x1080, 2 min 19 s), and a message refused anything over 200 MB, so it
// was the one file of the Brand kit that could not go. Measured: 0 of 1.
//
// Big files went up as 8 MB rows of base64 in the message-files table, which
// for 625 MB is 79 rows and 830 MB of database. They now go as the same 8 MB
// pieces into a private storage bucket, raw, and the reader puts them back
// together into the film the tile plays. A message carries up to 1 GB; one byte
// more is refused and says so. A list sent before this (pieces in the table)
// still opens.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aMac, aProject, conversation, createMemoryCloud, disk, opened, signUpMemory, until, write } from './lib/two-macs-over-one-cloud.mjs';
import { MAX_SENT_BYTES, PART_BYTES, carryLine, overTheLimit, sizeWords, tooBigToSend, whyWords } from '../shared/carried-files.mjs';
import { ROOM_MAX_BYTES } from '../shared/room-file-parts.mjs';
import { createFileCarrier, pieceSizes } from '../main/team/carry-files.mjs';
import { partFile, validEntry } from '../main/team/carried-shelf.mjs';

const MB = 1024 * 1024;
const GB = 1024 * MB;
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

describe('the limit', () => {
  it('is 1 GB: exactly 1 GB goes, one byte more does not', () => {
    expect(MAX_SENT_BYTES).toBe(GB);
    expect(tooBigToSend(GB)).toBe(false);
    expect(tooBigToSend(625 * MB)).toBe(false);
    expect(tooBigToSend(GB + 1)).toBe(true);
  });

  it('says so in words a person reads', () => {
    expect(overTheLimit(1.5 * GB)).toBe('1.5 GB is over the 1 GB a message can send. Send a smaller copy, or share a link.');
    expect(whyWords('tooBig')).toBe('it is over 1 GB');
    expect(sizeWords(625 * MB)).toBe('625 MB');
    expect(sizeWords(GB)).toBe('1 GB');
  });

  it('cuts the 625 MB intro into 79 pieces and 1 GB into 128, none over 8 MB', () => {
    expect(pieceSizes(625 * MB).length).toBe(79);
    const sizes = pieceSizes(GB);
    expect(sizes.length).toBe(128);
    expect(Math.max(...sizes)).toBe(PART_BYTES);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(GB);
  });

  it('takes a teammate\'s list for 1 GB in 128 pieces, and not 1 GB and a byte, or 129 pieces', () => {
    const list = (size, n) => ({
      ref: 'intro.mp4', main: 'intro.mp4', at: 1,
      parts: [{ path: 'intro.mp4', cloud: 'abcabcabcabc-intro.mp4', size, bucket: true, chunks: Array.from({ length: n }, (_, i) => ({ cloud: `abcabcabcabc-intro.mp4.p${i + 1}of${n}`, size: PART_BYTES })) }],
    });
    expect(validEntry(list(GB, 128))?.parts[0]).toMatchObject({ bucket: true, size: GB });
    expect(validEntry(list(GB + 1, 128))).toBeNull();
    expect(validEntry(list(GB, 129))).toBeNull();
  });

  it('leaves group chats at 200 MB, whose parts are still rows', () => {
    expect(ROOM_MAX_BYTES).toBe(200 * MB);
  });
});

describe('the sender', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'film-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const sparse = (name, size) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, '');
    fs.truncateSync(file, size);
    return file;
  };

  it('starts a film of exactly 1 GB on its way in 128 pieces, into the bucket and not the table', async () => {
    const file = sparse('intro.mp4', GB);
    const pieces = [];
    const carrier = createFileCarrier({
      dir,
      find: async () => ({ file, size: GB, root: dir }),
      has: async () => { throw new Error('the table was asked'); },
      put: async () => { throw new Error('the table was written'); },
      get: async () => null,
      putPiece: async (name, bytes) => { pieces.push({ name, length: bytes.length }); throw new Error('offline'); },
      getPiece: async () => null,
      retryMs: [0, 0],
    });
    expect(await carrier.send('intro.mp4', { meant: true })).toEqual({ sent: false, working: true });
    await carrier.settled();
    expect(pieces[0].name).toMatch(/^[0-9a-f]{12}-intro\.mp4\.p1of128$/);
    expect(pieces[0].length).toBe(PART_BYTES);
    expect((await carrier.send('intro.mp4', { meant: true })).failed).toBe(true);
  });

  it('refuses 1 GB and a byte without reading it', async () => {
    const file = sparse('raw.mov', GB + 1);
    const carrier = createFileCarrier({
      dir,
      find: async () => ({ file, size: GB + 1, root: dir }),
      has: async () => [], put: async () => {}, get: async () => null,
      putPiece: async () => { throw new Error('a piece went'); },
      getPiece: async () => null,
    });
    const r = await carrier.send('raw.mov', { meant: true });
    expect(r.entry).toMatchObject({ ref: 'raw.mov', tooBig: GB + 1 });
  });
});

describe('a teammate', () => {
  let cloud, maya, dev, mine;
  const say = (words) => maya.on(() => maya.service.message(dev.personId, words));

  beforeEach(async () => {
    disk._internals.forgetFolds();
    cloud = createMemoryCloud();
    maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
    dev = await aMac(cloud, signUpMemory(cloud, { email: 'dev@nw.test', name: 'Dev Rao' }));
    await maya.service.signIn();
    await maya.service.createTeam('Northwind');
    await maya.service.invite('dev@nw.test');
    await dev.service.signIn();
    await dev.service.acceptInvite(maya.service.state().team.id);
    mine = aProject(maya, 'Brand kit');
    await say('Morning!');
    await maya.service.syncNow();
    await dev.service.syncNow();
  });
  afterEach(async () => { for (const m of [maya, dev]) await m.service.signOut(); });

  it('gets a film over 10 MB byte for byte, its pieces in the bucket and none in the table', async () => {
    const film = crypto.randomBytes(3 * PART_BYTES + 4321);
    write(mine.dir, 'films/oct-7-intro.mp4', film);
    await say('The original: [oct-7-intro.mp4](films/oct-7-intro.mp4)');
    expect(await until([maya, dev], async () => (await opened(dev, 'films/oct-7-intro.mp4')).ok)).toBe(true);
    const there = await opened(dev, 'films/oct-7-intro.mp4');
    expect(sha(fs.readFileSync(there.path))).toBe(sha(film));
    expect(there.path).toMatch(/\.mp4$/);
    expect(cloud.files.size).toBe(0);
    const pieces = [...cloud.pieces.values()];
    expect(pieces.length).toBe(4);
    for (const p of pieces) expect(p.bytes.length).toBeLessThanOrEqual(PART_BYTES);
    expect(carryLine((await opened(maya, 'films/oct-7-intro.mp4')).carry).label).toBe('Sent');
  });

  it('says a film over 1 GB did not go, on both sides, and sends none of it', async () => {
    const file = path.join(mine.dir, 'films', 'huge.mp4');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
    fs.truncateSync(file, GB + 1);
    await say('[huge](films/huge.mp4)');
    await maya.service.syncNow();
    await dev.service.syncNow();
    expect(cloud.pieces.size).toBe(0);
    expect(cloud.files.size).toBe(0);
    expect((await opened(dev, 'films/huge.mp4')).carry).toMatchObject({ state: 'failed', why: 'tooBig' });
    expect(carryLine((await opened(maya, 'films/huge.mp4')).carry).label).toBe('Not delivered: it is over 1 GB');
  });

  it('still opens a film sent before, whose pieces are rows in the table', async () => {
    const film = crypto.randomBytes(PART_BYTES + 99);
    const dir = conversation(dev).dir;
    const rows = new Map();
    const chunks = pieceSizes(film.length).map((size, i) => {
      const bytes = film.subarray(i * PART_BYTES, i * PART_BYTES + size);
      const name = `${sha(bytes).slice(0, 12)}-old.mp4.p${i + 1}of2`;
      rows.set(name, bytes.toString('base64'));
      return { cloud: name, size };
    });
    const entry = { ref: 'old.mp4', main: 'old.mp4', at: 1, parts: [{ path: 'old.mp4', cloud: `${sha(film).slice(0, 12)}-old.mp4`, size: film.length, chunks }] };
    const carrier = createFileCarrier({
      dir,
      find: async () => null,
      has: async (names) => names.filter((n) => rows.has(n)),
      put: async () => {},
      get: async (name) => rows.get(name) ?? null,
      putPiece: async () => {},
      getPiece: async () => { throw new Error('the bucket was asked for an old film'); },
    });
    await carrier.take([entry]);
    await carrier.settled();
    expect(sha(fs.readFileSync(partFile(dir, validEntry(entry), entry.parts[0])))).toBe(sha(film));
  });
});
