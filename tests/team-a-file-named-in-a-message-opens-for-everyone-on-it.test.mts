// A FILE NAMED IN A MESSAGE OPENS FOR EVERYONE ON THE MESSAGE.
//
// All four people using it named this first. Only `](attachments/x)` links
// ever crossed, so a doc Maya named read "group-bookings-v1.md is not in Direct.
// Nothing was opened." on Dev's side, a report an agent wrote in company/reports
// opened for nobody else, and a redraw an agent posted as a note never left its
// owner's Mac (whatATeammateMaySet dropped `note` and `result`). Measured with
// two copies over the in-memory cloud: resolveArtifact on the reader's copy
// answered not found for every form of the name.
//
// The other half is what must NOT cross: a file nobody named, a file in a
// private project guessed from a bare name, a path that climbs out of the
// sender's projects, and a name a teammate wrote about a file on your Mac.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mjs';
import { resolveArtifact } from '../main/artifact-path.mjs';
import { MAX_MESSAGE_FILE_BYTES } from '../main/team/sync.mts';

async function aMac(cloud, personId, { wrap = (b) => b } = {}) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'carry-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => wrap(memoryBackend(cloud, personId))),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  return { personId, store, service, on, accountRoot, storeRoot };
}

const conversation = (mac) => mac.store.listProducts().find((p) => p.team?.direct) ?? null;
const opened = (mac, src) => resolveArtifact({
  src, product: conversation(mac).slug, products: mac.store.listProducts(),
  accountRoot: mac.accountRoot, storeRoot: mac.storeRoot,
});
const bytesOf = async (mac, src) => {
  const r = await opened(mac, src);
  return r.ok ? fs.readFileSync(r.path) : null;
};
function aProject(mac, name) {
  const { slug } = mac.store.createProduct({ name });
  const dir = mac.store.listProducts().find((p) => p.slug === slug).dir;
  return { slug, dir };
}
function write(dir, rel, bytes) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return file;
}

let cloud, maya, dev, sofia, company;
const say = async (words) => {
  await maya.on(() => maya.service.message(dev.personId, words));
  await maya.service.syncNow();
  await dev.service.syncNow();
};

beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
  dev = await aMac(cloud, signUpMemory(cloud, { email: 'dev@nw.test', name: 'Dev Rao' }));
  sofia = await aMac(cloud, signUpMemory(cloud, { email: 'sofia@nw.test', name: 'Sofia Ruiz' }));
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  for (const [mac, email] of [[dev, 'dev@nw.test'], [sofia, 'sofia@nw.test']]) {
    await maya.service.invite(email);
    await mac.service.signIn();
    await mac.service.acceptInvite(maya.service.state().team.id);
  }
  company = aProject(maya, 'Company');
  await maya.service.share(company.slug, { visibility: 'team' });
  await maya.on(() => maya.service.message(dev.personId, 'Morning!'));
  await maya.service.syncNow();
  await dev.service.syncNow();
});
afterEach(async () => { for (const m of [maya, dev, sofia]) await m.service.signOut(); });

describe('wherever on the sender\'s computer the file lives', () => {
  it('opens a report named only by its bare name, for the reader and the sender', async () => {
    write(company.dir, 'reports/shot-plan.md', '# Shot plan\n');
    await say('Please read shot-plan.md');
    expect(String(await bytesOf(dev, 'shot-plan.md'))).toBe('# Shot plan\n');
    expect(String(await bytesOf(maya, 'shot-plan.md'))).toBe('# Shot plan\n');
  });

  it('opens a file named by its folder and by its whole path on the sender\'s disk', async () => {
    const full = write(company.dir, 'designs/a.png', 'png-a');
    write(company.dir, 'reports/b.pdf', 'pdf-b');
    await say(`See ${full} and \`reports/b.pdf\``);
    expect(String(await bytesOf(dev, full))).toBe('png-a');
    expect(String(await bytesOf(dev, 'reports/b.pdf'))).toBe('pdf-b');
  });

  it('opens a file in the project\'s code repository', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
    write(repo, 'docs/cut.mp4', 'film');
    const { slug } = maya.store.createProduct({ name: 'App', repoPath: repo });
    await maya.service.share(slug, { visibility: 'team' });
    await say('the cut is docs/cut.mp4');
    expect(String(await bytesOf(dev, 'docs/cut.mp4'))).toBe('film');
  });

  it('still opens an attachment, a film and a deck among them', async () => {
    const dir = conversation(maya).dir;
    write(dir, 'attachments/k1-deck.pdf', 'deck');
    write(dir, 'attachments/k2-cut.mp4', 'film');
    await say('[deck](attachments/k1-deck.pdf) [cut](attachments/k2-cut.mp4)');
    expect(String(await bytesOf(dev, 'attachments/k1-deck.pdf'))).toBe('deck');
    expect(String(await bytesOf(dev, 'attachments/k2-cut.mp4'))).toBe('film');
  });

  it('brings a file named before the sender updated', async () => {
    write(company.dir, 'reports/old.md', 'old');
    await dev.service.signOut();
    // A line pushed by a copy that carried only attachments, so the cursor
    // that moves over attachments has gone past it.
    await say('old.md, from yesterday');
    await dev.service.signIn();
    await dev.service.syncNow();
    expect(String(await bytesOf(dev, 'old.md'))).toBe('old');
  });
});

describe('a newer file under the same name', () => {
  it('opens the newer one once a later message names it again', async () => {
    write(company.dir, 'reports/plan.md', 'v1');
    await say('plan.md');
    expect(String(await bytesOf(dev, 'plan.md'))).toBe('v1');
    write(company.dir, 'reports/plan.md', 'v2');
    await say('plan.md is updated');
    expect(String(await bytesOf(dev, 'plan.md'))).toBe('v2');
  });

  it('keeps two people\'s same-named files apart when each names its own path', async () => {
    write(company.dir, 'reports/plan.md', 'mayas');
    const dc = aProject(dev, 'Dev Stuff');
    await dev.service.share(dc.slug, { visibility: 'team' });
    write(dc.dir, 'notes/plan.md', 'devs');
    await say('reports/plan.md');
    await dev.on(() => dev.service.message(maya.personId, 'and notes/plan.md'));
    await dev.service.syncNow();
    await maya.service.syncNow();
    expect(String(await bytesOf(maya, 'reports/plan.md'))).toBe('mayas');
    expect(String(await bytesOf(maya, 'notes/plan.md'))).toBe('devs');
  });
});

describe('a document brings the pictures it draws', () => {
  it('brings a picture the document names beside it, and not the one it does not', async () => {
    write(company.dir, 'reports/frames/f7.png', 'frame');
    write(company.dir, 'reports/frames/unused.png', 'unused');
    write(company.dir, 'reports/review.md', '# Review\n\n![Frame at 7.5 seconds](frames/f7.png)\n');
    await say('reports/review.md');
    const r = await opened(dev, 'reports/review.md');
    expect(r.ok).toBe(true);
    expect(String(fs.readFileSync(path.join(path.dirname(r.path), 'frames/f7.png')))).toBe('frame');
    expect(fs.existsSync(path.join(path.dirname(r.path), 'frames/unused.png'))).toBe(false);
    expect(JSON.stringify([...cloud.files.values()].map((f) => f.name))).not.toContain('unused');
  });

  it('brings a picture a page loads from a folder beside it', async () => {
    write(company.dir, 'designs/shots/a.png', 'shot');
    write(company.dir, 'reports/page.html', '<img src="../designs/shots/a.png">');
    await say('reports/page.html');
    const r = await opened(dev, 'reports/page.html');
    expect(String(fs.readFileSync(path.resolve(path.dirname(r.path), '../designs/shots/a.png')))).toBe('shot');
  });

  it('leaves a picture that climbs out of the project behind', async () => {
    const outside = path.join(path.dirname(path.dirname(company.dir)), 'secret.png');
    fs.writeFileSync(outside, 'secret');
    write(company.dir, 'reports/page.md', `![x](${path.relative(path.join(company.dir, 'reports'), outside)})`);
    await say('reports/page.md');
    expect((await opened(dev, 'reports/page.md')).ok).toBe(true);
    expect([...cloud.files.values()].map((f) => Buffer.from(f.data, 'base64').toString())).not.toContain('secret');
  });
});

describe('what an agent posts', () => {
  it('reaches the other people on the thread, with the pictures it names', async () => {
    write(company.dir, 'designs/still-3.png', 'still');
    const convo = conversation(maya);
    const id = disk.readWorkItems(convo.dir)[0].id;
    await maya.on(() => disk.updateWorkItem(convo.dir, id, { note: 'Here is shot 3: designs/still-3.png' }, { source: 'agent' }));
    await maya.service.syncNow();
    await dev.service.syncNow();
    const there = disk.readWorkItems(conversation(dev).dir)[0];
    expect(there.note).toContain('Here is shot 3');
    expect(String(await bytesOf(dev, 'designs/still-3.png'))).toBe('still');
  });

  it('crosses as a result too', async () => {
    const convo = conversation(maya);
    const id = disk.readWorkItems(convo.dir)[0].id;
    await maya.on(() => disk.updateWorkItem(convo.dir, id, { result: 'Finished the plan.' }, { source: 'agent' }));
    await maya.service.syncNow();
    await dev.service.syncNow();
    expect(disk.readWorkItems(conversation(dev).dir)[0].result).toBe('Finished the plan.');
  });

  it('still keeps a note in an ordinary shared project on its own Mac', async () => {
    const { id } = maya.store.composeItem(company.slug, { title: 'A job' });
    await maya.on(() => disk.updateWorkItem(company.dir, id, { note: 'private working note reports/x.md' }, { source: 'agent' }));
    write(company.dir, 'reports/x.md', 'x');
    await maya.service.syncNow();
    await dev.service.syncNow();
    const here = dev.store.listProducts().find((p) => p.team?.projectId === maya.store.listProducts().find((q) => q.slug === company.slug).team.projectId);
    expect(disk.readWorkItems(here.dir).find((i) => i.id === id)?.note).toBeUndefined();
    expect(JSON.stringify([...cloud.files.values()])).not.toContain(Buffer.from('x').toString('base64') + '"');
  });
});

describe('what must not cross', () => {
  const names = () => [...cloud.files.values()].map((f) => f.name).join(' ');

  it('never sends a file nobody named', async () => {
    write(company.dir, 'reports/named.md', 'named');
    write(company.dir, 'reports/not-named.md', 'quiet');
    await say('named.md');
    expect(names()).toContain('named.md');
    expect(names()).not.toContain('not-named');
    expect((await opened(dev, 'not-named.md')).ok).toBe(false);
  });

  // A bare word is a guess, so it sends nothing and says nothing: no stray
  // "could not be sent" in the middle of a sentence (seen by all four people).
  it('does not guess a bare name into a private project, and leaves no line about it', async () => {
    const mine = aProject(maya, 'Private Notes');
    write(mine.dir, 'reports/salaries.md', 'pay');
    await say('see salaries.md');
    expect(names()).not.toContain('salaries');
    const r = await opened(dev, 'salaries.md');
    expect(r.ok).toBe(false);
    expect(r.error).not.toMatch(/could not be sent/);
    expect(r.coming).toBeFalsy();
  });

  it('does not guess into a project only some of the people on the message may see', async () => {
    const some = aProject(maya, 'Founders');
    await maya.service.share(some.slug, { visibility: 'people', people: [sofia.personId] });
    write(some.dir, 'reports/board.md', 'board');
    await say('board.md');
    expect(names()).not.toContain('board');
  });

  it('does guess into a chosen-people project everyone on the message may see', async () => {
    const some = aProject(maya, 'Duo');
    await maya.service.share(some.slug, { visibility: 'people', people: [dev.personId] });
    write(some.dir, 'reports/duo.md', 'duo');
    await say('duo.md');
    expect(String(await bytesOf(dev, 'duo.md'))).toBe('duo');
  });

  it('sends a private project\'s file only when its whole path is written out', async () => {
    const mine = aProject(maya, 'Private Notes');
    const full = write(mine.dir, 'reports/chosen.md', 'chosen');
    await say(`this one: ${full}`);
    expect(String(await bytesOf(dev, full))).toBe('chosen');
  });

  it('refuses a whole path outside every project', async () => {
    const outside = path.join(os.tmpdir(), `outside-${process.pid}.md`);
    fs.writeFileSync(outside, 'outside');
    await say(`read ${outside}`);
    expect(names()).not.toContain('outside');
    expect((await opened(dev, outside)).ok).toBe(false);
    fs.rmSync(outside);
  });

  it('refuses another conversation\'s folder', async () => {
    await maya.on(() => maya.service.message(sofia.personId, 'psst'));
    const other = maya.store.listProducts().filter((p) => p.team?.direct).find((p) => p.team.people.includes(sofia.personId));
    const full = write(other.dir, 'attachments/psst.png', 'psst');
    await say(full);
    expect(names()).not.toContain('psst');
  });

  it('refuses a link inside a project that points out of it', async () => {
    const outside = path.join(os.tmpdir(), `linked-${process.pid}.md`);
    fs.writeFileSync(outside, 'linked');
    fs.mkdirSync(path.join(company.dir, 'reports'), { recursive: true });
    fs.symlinkSync(outside, path.join(company.dir, 'reports', 'looks-fine.md'));
    await say('reports/looks-fine.md');
    expect(names()).not.toContain('looks-fine');
    fs.rmSync(outside);
  });

  it('refuses a hidden folder and a kind nobody can read', async () => {
    write(company.dir, '.secrets/keys.md', 'keys');
    write(company.dir, 'reports/run.sh', 'rm');
    await say('.secrets/keys.md and reports/run.sh');
    expect(names()).not.toContain('keys');
    expect(names()).not.toContain('run.sh');
  });

  it('does not send your file because a teammate named it', async () => {
    write(company.dir, 'reports/maya-only.md', 'hers');
    await dev.on(() => dev.service.message(maya.personId, 'send me maya-only.md'));
    await dev.service.syncNow();
    await maya.service.syncNow();
    await maya.service.syncNow();
    expect(names()).not.toContain('maya-only');
  });

  it('keeps a file from somebody not on the message', async () => {
    write(company.dir, 'reports/for-dev.md', 'x');
    await say('for-dev.md');
    const held = [...cloud.files.values()].find((f) => f.name.includes('for-dev'));
    const asSofia = memoryBackend(cloud, sofia.personId);
    expect(await asSofia.getFile(held.projectId, held.name)).toBeNull();
    expect(await asSofia.hasFiles(held.projectId, [held.name])).toEqual([]);
  });

  it('crosses nothing in an ordinary shared project', async () => {
    write(company.dir, 'reports/board.md', 'board');
    const { id } = maya.store.composeItem(company.slug, { title: 'See board.md' });
    expect(id).toBeTruthy();
    await maya.service.syncNow();
    expect(names()).not.toContain('board');
  });

  it('ignores a forged list that writes outside the conversation', async () => {
    const convo = conversation(dev);
    const asMaya = memoryBackend(cloud, maya.personId);
    const line = { id: disk.readWorkItems(convo.dir)[0].id, ts: 1, source: 'system', by: maya.personId, uid: 'forged-1', patch: { carries: [
      { ref: 'x.md', main: '../../../evil.md', parts: [{ path: '../../../evil.md', cloud: 'abcabcabcabc-evil.md', size: 4 }] },
    ] } };
    await asMaya.putFile(convo.team.projectId, 'abcabcabcabc-evil.md', Buffer.from('evil').toString('base64'));
    await asMaya.pushLines(convo.team.projectId, [line]);
    await dev.service.syncNow();
    expect(fs.existsSync(path.resolve(convo.dir, 'attachments/carried/abcabcabcabc-evil/../../../evil.md'))).toBe(false);
    expect(disk.readWorkItems(convo.dir)[0].carries).toBeUndefined();
    expect((await opened(dev, 'x.md')).ok).toBe(false);
  });
});

describe('a file at the limit, and a file on its way', () => {
  it('takes a file exactly at the limit', async () => {
    write(company.dir, 'reports/edge.mp4', Buffer.alloc(MAX_MESSAGE_FILE_BYTES));
    await say('edge.mp4');
    expect((await opened(dev, 'edge.mp4')).ok).toBe(true);
  });

  it('says on its way while the cloud has not got it, then fills in by itself', async () => {
    let refuse = true;
    const flaky = await aMac(cloud, signUpMemory(cloud, { email: 'flaky@nw.test', name: 'Flaky' }), {
      wrap: (b) => ({ ...b, personId: b.personId, putFile: (...a) => (refuse ? Promise.reject(new Error('offline')) : b.putFile(...a)) }),
    });
    await maya.service.invite('flaky@nw.test');
    await flaky.service.signIn();
    await flaky.service.acceptInvite(maya.service.state().team.id);
    const theirs = aProject(flaky, 'Theirs');
    await flaky.service.share(theirs.slug, { visibility: 'team' });
    write(theirs.dir, 'reports/late.pdf', 'late');
    await flaky.on(() => flaky.service.message(dev.personId, 'late.pdf'));
    await flaky.service.syncNow();
    await dev.service.syncNow();
    const product = dev.store.listProducts().filter((p) => p.team?.direct).find((p) => disk.readWorkItems(p.dir).some((i) => i.body === 'late.pdf'));
    const ask = () => resolveArtifact({ src: 'late.pdf', product: product.slug, products: dev.store.listProducts(), accountRoot: dev.accountRoot, storeRoot: dev.storeRoot });
    const waiting = await ask();
    expect(waiting.ok).toBe(false);
    expect(waiting.coming).toBe(true);
    expect(waiting.error).toMatch(/on its way/);
    expect(waiting.error).not.toMatch(/is not in/);
    refuse = false;
    await flaky.service.syncNow();
    await dev.service.syncNow();
    expect((await ask()).ok).toBe(true);
    await flaky.service.signOut();
  });

  it('sends a file its message named before it was written', async () => {
    await say('coming-soon.md');
    expect((await opened(dev, 'coming-soon.md')).ok).toBe(false);
    write(company.dir, 'reports/coming-soon.md', 'now');
    await maya.service.syncNow();
    await dev.service.syncNow();
    expect(String(await bytesOf(dev, 'coming-soon.md'))).toBe('now');
  });
});
