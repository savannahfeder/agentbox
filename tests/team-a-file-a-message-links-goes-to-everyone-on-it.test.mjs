// A FILE A MESSAGE LINKS GOES TO EVERYONE ON THE MESSAGE, WHEREVER THE SENDER KEEPS IT.
//
// Seen by all four people using it: a person's attachment opened for everyone and
// the same file from an agent did not. "launch-cut-v1.mp4 could not be sent: it
// is not in a project everyone on this message can see" sat inside sentences
// that only mentioned a file, and "launch-cut-v2.mp4 could not be found" stood
// where an agent's film should have been. Measured with two copies over the
// in-memory cloud: a file in a project only its sender had, linked in a message,
// reached nobody; a bare word that merely looked like a file name left a
// "could not be sent" line behind.
//
// The other half is what must NOT cross: outside the sender's projects, through
// a link out, hidden folders, secret-looking names, and what a teammate names
// on your computer.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aMac, aProject, bytesOf, conversation, createMemoryCloud, disk, opened, signUpMemory, write } from './lib/two-macs-over-one-cloud.mjs';

let cloud, maya, dev, sofia, company, mine;
const say = async (words, { as = maya, to = dev } = {}) => {
  await as.on(() => as.service.message(to.personId, words));
  await as.service.syncNow();
  await to.service.syncNow();
  await as.service.syncNow();
  await to.service.syncNow();
};
const names = () => [...cloud.files.values()].map((f) => f.name).join(' ');

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
  mine = aProject(maya, 'Private Notes');
  await maya.on(() => maya.service.message(dev.personId, 'Morning!'));
  await maya.service.syncNow();
  await dev.service.syncNow();
});
afterEach(async () => { for (const m of [maya, dev, sofia]) await m.service.signOut(); });

describe('a file the sender pointed at, in any project of theirs', () => {
  it('opens for the reader when a markdown link names it by its bare name', async () => {
    write(mine.dir, 'reports/shot-plan.md', '# Shot plan\n');
    await say('Read [the plan](shot-plan.md) before noon');
    expect(String(await bytesOf(dev, 'shot-plan.md'))).toBe('# Shot plan\n');
  });

  it('opens for the reader when a code span names it', async () => {
    write(mine.dir, 'reports/cut.pdf', 'deck');
    await say('The deck is `reports/cut.pdf`.');
    expect(String(await bytesOf(dev, 'reports/cut.pdf'))).toBe('deck');
  });

  it('opens for the reader when a path is written in the sentence', async () => {
    write(mine.dir, 'designs/a.png', 'png-a');
    await say('see designs/a.png now');
    expect(String(await bytesOf(dev, 'designs/a.png'))).toBe('png-a');
  });

  it('goes to everyone on the thread when an agent links it in a note', async () => {
    write(mine.dir, 'cuts/launch-cut-v2.mp4', 'film');
    const convo = conversation(maya);
    const id = disk.readWorkItems(convo.dir)[0].id;
    await maya.on(() => disk.updateWorkItem(convo.dir, id, { note: 'Cut 2 is ready: [launch-cut-v2.mp4](cuts/launch-cut-v2.mp4)' }, { source: 'agent' }));
    await maya.service.syncNow();
    await dev.service.syncNow();
    expect(String(await bytesOf(dev, 'cuts/launch-cut-v2.mp4'))).toBe('film');
  });

  it('still opens for the sender, who can open their own file', async () => {
    write(mine.dir, 'reports/own.md', 'own');
    await say('[own](own.md)');
    expect((await opened(maya, 'own.md')).ok).toBe(true);
  });
});

describe('a bare word that only looks like a file name', () => {
  it('sends nothing from a private project, and leaves no "could not be sent" for the reader', async () => {
    write(mine.dir, 'reports/salaries.md', 'pay');
    await say('see salaries.md');
    expect(names()).not.toContain('salaries');
    const r = await opened(dev, 'salaries.md');
    expect(r.ok).toBe(false);
    expect(r.coming).toBeFalsy();
    expect(JSON.stringify(r)).not.toMatch(/could not be sent|on its way/);
    expect(r.carry).toBeUndefined();
  });

  it('says nothing for the sender either', async () => {
    write(mine.dir, 'reports/salaries.md', 'pay');
    await say('see salaries.md');
    const r = await opened(maya, 'salaries.md');
    expect(r.ok).toBe(false);
    expect(r.coming).toBeFalsy();
    expect(r.carry).toBeUndefined();
  });

  it('still goes when the file is in a project everyone on the message may see', async () => {
    write(company.dir, 'reports/shared.md', 'shared');
    await say('see shared.md');
    expect(String(await bytesOf(dev, 'shared.md'))).toBe('shared');
  });

  it('is sent after all when the sender then links it', async () => {
    write(mine.dir, 'reports/later.md', 'later');
    await say('see later.md');
    expect(names()).not.toContain('later');
    await say('sorry, [later.md](later.md)');
    expect(String(await bytesOf(dev, 'later.md'))).toBe('later');
  });
});

describe('what must not cross, even when linked', () => {
  it('a file outside every project of the sender', async () => {
    const outside = path.join(os.tmpdir(), `outside-${process.pid}.md`);
    fs.writeFileSync(outside, 'outside');
    await say(`read [it](${outside})`);
    expect(names()).not.toContain('outside');
    expect((await opened(dev, outside)).ok).toBe(false);
    const there = await opened(dev, outside);
    expect(there.carry).toMatchObject({ state: 'failed', why: 'outside' });
    fs.rmSync(outside);
  });

  it('a file reached through a link that points out of the project', async () => {
    const outside = path.join(os.tmpdir(), `linked-${process.pid}.md`);
    fs.writeFileSync(outside, 'linked');
    fs.mkdirSync(path.join(mine.dir, 'reports'), { recursive: true });
    fs.symlinkSync(outside, path.join(mine.dir, 'reports', 'looks-fine.md'));
    await say('[x](reports/looks-fine.md)');
    expect(names()).not.toContain('looks-fine');
    fs.rmSync(outside);
  });

  it('a file in a hidden folder', async () => {
    write(mine.dir, '.private/plan.md', 'hidden');
    await say('[x](.private/plan.md) and `.private/plan.md`');
    expect(names()).not.toContain('plan');
  });

  it('a file with a secret-looking name, by bare name, relative path and full path', async () => {
    const one = write(mine.dir, 'notes/secrets.md', 'a');
    write(mine.dir, 'notes/api-keys.md', 'b');
    write(mine.dir, 'secrets/plan.md', 'c');
    await say(`[a](secrets.md) [b](notes/api-keys.md) [c](secrets/plan.md) [d](${one})`);
    expect(names()).not.toMatch(/secrets|api-keys|plan/);
    expect((await opened(dev, 'notes/api-keys.md')).carry).toMatchObject({ state: 'failed', why: 'secret' });
  });

  it('a name that merely contains a secret-looking word is still fine', async () => {
    write(mine.dir, 'notes/keyboard-shortcuts.md', 'keys');
    await say('[k](notes/keyboard-shortcuts.md)');
    expect(String(await bytesOf(dev, 'notes/keyboard-shortcuts.md'))).toBe('keys');
  });

  it('another conversation\'s folder', async () => {
    await maya.on(() => maya.service.message(sofia.personId, 'psst'));
    const other = maya.store.listProducts().filter((p) => p.team?.direct).find((p) => p.team.people.includes(sofia.personId));
    const full = write(other.dir, 'attachments/psst.png', 'psst');
    await say(`[x](${full})`);
    expect(names()).not.toContain('psst');
  });

  it('a kind nobody can read', async () => {
    write(mine.dir, 'scripts/run.sh', 'rm');
    await say('[x](scripts/run.sh) `scripts/run.sh`');
    expect(names()).not.toContain('run.sh');
  });

  it('a file your teammate names on their side of the thread', async () => {
    write(mine.dir, 'reports/maya-only.md', 'hers');
    await dev.on(() => dev.service.message(maya.personId, 'send me [it](maya-only.md)'));
    await dev.service.syncNow();
    await maya.service.syncNow();
    await maya.service.syncNow();
    expect(names()).not.toContain('maya-only');
  });

  it('anyone not on the message', async () => {
    write(mine.dir, 'reports/for-dev.md', 'x');
    await say('[x](for-dev.md)');
    const held = [...cloud.files.values()].find((f) => f.name.includes('for-dev'));
    expect(held).toBeTruthy();
    const { memoryBackend } = await import('./lib/two-macs-over-one-cloud.mjs');
    const asSofia = memoryBackend(cloud, sofia.personId);
    expect(await asSofia.getFile(held.projectId, held.name)).toBeNull();
  });
});
