// A VIDEO OPEN IN THE APP CAN BE SHARED BY ITS LINK.
//
// Asked for 2026-11-09 (w-17c726d3a4): the Agent Docs film shows videos shared
// by link, and a video open in the app had no Share button, because a link's
// row held the whole file. A film now goes up as 8 MB pieces and the link
// holds their list. Measured against the memory cloud with a real file on
// disk: every piece arrives and reads back as the film, a new cut moves the
// link only once all of it is up, the old cut's pieces go, a stopped link
// reads as nothing, and a film too big says so.
import { it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { LINK_FILM_MAX_BYTES, LINK_PIECE_BYTES, linkCopyOf, linkKindOf } from '../main/file-link.mts';
import { canShareFile } from '../renderer/src/components/ShareLink.tsx';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'film-link-'));
const film = (name: string, bytes: number, fill: number) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.alloc(bytes, fill));
  return p;
};

let cloud: ReturnType<typeof createMemoryCloud>;
let maya: Awaited<ReturnType<typeof createTeamService>>;
let anyone: ReturnType<typeof memoryBackend>;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'film-link-store-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const me = signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' });
  maya = createTeamService({
    session: memorySession(() => memoryBackend(cloud, me)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
    shareSite: 'https://app.agentbox.ac',
  });
  await maya.signIn();
  anyone = memoryBackend(cloud, signUpMemory(cloud, { email: 'jun@else.test', name: 'Jun' }));
});

const SOURCE = 'agentbox-team/w-1/agent-docs-cut';
const share = (file: string) => {
  const copy = linkCopyOf(file);
  if ('error' in copy && copy.error) throw new Error(copy.error);
  return maya.shareFile({ source: SOURCE, ...(copy as Exclude<typeof copy, { error: string }>) });
};
async function readBack(token: string) {
  const { file } = await anyone.fileLinkView(token);
  const { pieces, hash } = JSON.parse(file!.body);
  const got: Buffer[] = [];
  for (let n = 0; n < pieces; n++) got.push((await anyone.linkPiece(`${token}/${hash}/${n}`))!);
  return { file: file!, bytes: Buffer.concat(got) };
}

it('offers Share on a video, and only on the kinds a link can play', () => {
  for (const name of ['cut.mp4', 'CUT.MOV', 'a.webm', 'b.m4v']) expect(canShareFile(name), name).toBe(true);
  for (const name of ['a.mkv', 'a.avi', 'a.mp3', 'mp4']) expect(canShareFile(name), name).toBe(false);
  expect(linkKindOf('cut.mov')).toEqual({ kind: 'video', type: 'video/quicktime' });
});

it('sends a film of several pieces and anyone with the link reads back the same bytes', async () => {
  const size = 2 * LINK_PIECE_BYTES + 1234;
  const made = await share(film('cut-v1.mp4', size, 7));
  const { file, bytes } = await readBack(made.link.token);
  expect(file).toMatchObject({ name: 'cut-v1.mp4', kind: 'video', type: 'video/mp4', version: 1 });
  expect(JSON.parse(file.body)).toMatchObject({ pieces: 3, size });
  expect(bytes.equals(fs.readFileSync(path.join(dir, 'cut-v1.mp4')))).toBe(true);
  expect(made.link.current).toBe(true);
});

it('puts a new cut in the same link, and clears the old cut\'s pieces', async () => {
  const first = (await share(film('cut-v1.mp4', LINK_PIECE_BYTES + 10, 1))).link;
  const second = (await share(film('cut-v2.mp4', 500, 2))).link;
  expect(second.token).toBe(first.token);
  expect(second.version).toBe(2);
  const { bytes } = await readBack(second.token);
  expect(bytes.equals(Buffer.alloc(500, 2))).toBe(true);
  expect([...cloud.linkPieces!.keys()]).toEqual([`${first.token}/${JSON.parse((await anyone.fileLinkView(first.token)).file!.body).hash}/0`]);
});

it('a link already holding this cut sends nothing again', async () => {
  const p = film('cut-v3.mp4', LINK_PIECE_BYTES + 10, 3);
  const made = (await share(p)).link;
  const before = new Map(cloud.linkPieces);
  await share(p);
  expect(cloud.linkPieces).toEqual(before);
  expect(made.token).toBeTruthy();
});

it('a new link whose pieces fail to go up is taken down rather than left half a film', async () => {
  let calls = 0;
  cloud.linkPieces = new Map();
  const realSet = cloud.linkPieces.set.bind(cloud.linkPieces);
  cloud.linkPieces.set = (k, v) => { if (++calls === 2) throw new Error('the network dropped'); return realSet(k, v); };
  await expect(share(film('cut-v4.mp4', 2 * LINK_PIECE_BYTES, 4))).rejects.toThrow(/network dropped/);
  expect(await maya.fileLink(SOURCE)).toMatchObject({ link: null });
});

it('reads as nothing once the link is stopped, and its pieces are cleared', async () => {
  const made = (await share(film('cut-v5.mp4', 100, 5))).link;
  const hash = JSON.parse((await anyone.fileLinkView(made.token)).file!.body).hash;
  await maya.stopFileLink(made.token);
  expect(await anyone.fileLinkView(made.token)).toEqual({ stopped: true, file: null });
  expect(await anyone.linkPiece(`${made.token}/${hash}/0`)).toBeNull();
  expect(cloud.linkPieces!.size).toBe(0);
});

it('says so when a film is too big or empty, before anything leaves the computer', () => {
  const big = path.join(dir, 'huge.mp4');
  fs.writeFileSync(big, '');
  fs.truncateSync(big, LINK_FILM_MAX_BYTES + 1);
  expect(linkCopyOf(big)).toEqual({ error: 'This film is over 200 MB, too big to share as a link.' });
  expect(linkCopyOf(film('empty.mp4', 0, 0))).toEqual({ error: 'This film is empty.' });
  fs.truncateSync(big, LINK_FILM_MAX_BYTES);
  expect(linkCopyOf(big)).toMatchObject({ kind: 'video', name: 'huge.mp4' });
});
