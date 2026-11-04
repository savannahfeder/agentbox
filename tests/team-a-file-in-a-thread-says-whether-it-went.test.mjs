// A FILE IN A THREAD SAYS WHETHER IT WENT, ON ITS OWN TILE.
//
// In use, a file was named, a grey sentence "X is on its way. It opens here
// when it lands." appeared inside the message's own words, and nine minutes
// later it still said the same, with the sender's copy not running. Nothing told
// the sender it had not gone. Measured with two copies over the in-memory cloud:
// opening the name on the reader's copy answered "coming" for ever, and on the
// sender's copy answered nothing about delivery at all.
//
// Now an answer about a carried name carries `carry`: Sent / On its way / Not
// delivered with a plain reason (and Try again for the sender) / waiting for the
// sender's computer, which the tile draws (shared/carried-files.mjs carryLine).
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { aMac, aProject, bytesOf, conversation, createMemoryCloud, disk, opened, signUpMemory, until, write } from './lib/two-macs-over-one-cloud.mjs';
import { carryLine } from '../shared/carried-files.mjs';

let cloud, maya, dev, mine, refuse;
const say = async (words) => {
  await maya.on(() => maya.service.message(dev.personId, words));
  await maya.service.syncNow();
  await dev.service.syncNow();
};

beforeEach(async () => {
  disk._internals.forgetFolds();
  refuse = false;
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }), {
    wrap: (b) => ({ ...b, personId: b.personId, putFile: (...a) => (refuse ? Promise.reject(new Error('offline')) : b.putFile(...a)) }),
  });
  dev = await aMac(cloud, signUpMemory(cloud, { email: 'dev@nw.test', name: 'Dev Rao' }));
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('dev@nw.test');
  await dev.service.signIn();
  await dev.service.acceptInvite(maya.service.state().team.id);
  mine = aProject(maya, 'Private Notes');
  await maya.on(() => maya.service.message(dev.personId, 'Morning!'));
  await maya.service.syncNow();
  await dev.service.syncNow();
});
afterEach(async () => { for (const m of [maya, dev]) await m.service.signOut(); });

describe('the sender', () => {
  it('sees Sent once the file is up, and can open their own copy', async () => {
    write(mine.dir, 'reports/plan.md', 'plan');
    await say('[plan](reports/plan.md)');
    const r = await opened(maya, 'reports/plan.md');
    expect(r.ok).toBe(true);
    expect(r.carry).toMatchObject({ state: 'sent', mine: true });
    expect(carryLine(r.carry).label).toBe('Sent');
  });

  it('sees On its way while the cloud will not take it, then Not delivered, with Try again', async () => {
    write(mine.dir, 'reports/late.pdf', 'late');
    refuse = true;
    await say('[late](reports/late.pdf)');
    expect((await opened(maya, 'reports/late.pdf')).carry).toMatchObject({ state: 'coming', mine: true });
    for (let i = 0; i < 8; i += 1) await maya.service.syncNow();
    const stuck = await opened(maya, 'reports/late.pdf');
    expect(stuck.carry).toMatchObject({ state: 'failed', mine: true, why: 'upload' });
    expect(carryLine(stuck.carry)).toMatchObject({ retry: true, label: 'Not delivered: the cloud could not be reached' });
    // It does not try for ever: the cloud coming back changes nothing until they press it.
    refuse = false;
    for (let i = 0; i < 3; i += 1) await maya.service.syncNow();
    await dev.service.syncNow();
    expect((await opened(maya, 'reports/late.pdf')).carry.state).toBe('failed');
    expect((await opened(dev, 'reports/late.pdf')).ok).toBe(false);

    const convo = conversation(maya);
    expect(await maya.service.retryFile({ product: convo.slug, src: 'reports/late.pdf' })).toBe(true);
    await dev.service.syncNow();
    expect((await opened(maya, 'reports/late.pdf')).carry).toMatchObject({ state: 'sent' });
    expect(String(await bytesOf(dev, 'reports/late.pdf'))).toBe('late');
  });

  it('is told plainly when what they linked is not there, after looking for a while', async () => {
    await say('[ghost](reports/ghost.pdf)');
    expect((await opened(maya, 'reports/ghost.pdf')).carry).toMatchObject({ state: 'coming', mine: true });
    // Not yet an answer for the others: an agent may write the file just after.
    expect((await opened(dev, 'reports/ghost.pdf')).carry?.state).not.toBe('failed');
    maya.skew = 11 * 60 * 1000;
    await maya.service.syncNow();
    await dev.service.syncNow();
    expect((await opened(maya, 'reports/ghost.pdf')).carry).toMatchObject({ state: 'failed', why: 'missing' });
    expect(carryLine((await opened(dev, 'reports/ghost.pdf')).carry).label).toBe('Not delivered: the file was not found on the sender\'s computer');
  });
});

describe('the reader', () => {
  it('sees On its way, then the file, with nothing said once it landed', async () => {
    write(mine.dir, 'reports/plan.md', 'plan');
    await say('[plan](reports/plan.md)');
    const r = await opened(dev, 'reports/plan.md');
    expect(r.ok).toBe(true);
    expect(r.carry).toBeUndefined();
  });

  it('is told it waits for the sender\'s computer, rather than waiting with no end', async () => {
    write(mine.dir, 'reports/late.pdf', 'late');
    refuse = true;
    await say('[late](reports/late.pdf)');
    const soon = await opened(dev, 'reports/late.pdf');
    expect(soon).toMatchObject({ ok: false, coming: true });
    expect(carryLine(soon.carry).label).toBe('On its way');
    const later = await opened(dev, 'reports/late.pdf', { now: Date.now() + 5 * 60 * 1000 });
    expect(later.carry).toMatchObject({ state: 'offline', by: 'Maya' });
    expect(carryLine(later.carry).label).toBe('Waiting for Maya\'s computer');
    // And it still fills in by itself when the sender's computer comes back.
    refuse = false;
    expect(await until([maya, dev], async () => (await opened(dev, 'reports/late.pdf')).ok)).toBe(true);
  });

  it('does not send "on its way" into the words of a message', () => {
    const source = fs.readFileSync(path.resolve('renderer/src/components/Focus.tsx'), 'utf8');
    const note = source.slice(source.indexOf('function CarriedNote'), source.indexOf('// A FOLDER A WORKER NAMES'));
    expect(note).not.toMatch(/r\.error/);
    expect(note).not.toMatch(/on its way/i);
  });
});

describe('what a tile says', () => {
  it('draws one tile for a file a link names by its own name, not two', async () => {
    const { withoutBareTwins } = await import('../renderer/src/file-glance.ts');
    expect(withoutBareTwins(['launch-plan.md', 'reports/launch-plan.md', 'api-keys.md', 'reports/api-keys.md'])).toEqual(['reports/launch-plan.md', 'reports/api-keys.md']);
    expect(withoutBareTwins(['plan.md', 'other/notes.md'])).toEqual(['plan.md', 'other/notes.md']);
  });

  it('says each state in plain words, and Try again only to the sender', () => {
    expect(carryLine({ state: 'coming', mine: true, done: 2, total: 8 })).toMatchObject({ label: 'On its way, 25%', percent: 25 });
    expect(carryLine({ state: 'failed', mine: true, why: 'upload' })).toMatchObject({ retry: true });
    expect(carryLine({ state: 'failed', mine: true, why: 'missing' })).toMatchObject({ retry: true });
    // Nothing pressing it could change: a key file, a file outside the projects, a file over 200 MB.
    for (const why of ['secret', 'outside', 'hidden', 'tooBig']) expect(carryLine({ state: 'failed', mine: true, why })).toMatchObject({ retry: false });
    expect(carryLine({ state: 'failed', mine: false, why: 'outside' })).toMatchObject({ retry: false, label: 'Not delivered: it was not inside one of the sender\'s projects' });
    expect(carryLine({ state: 'offline' }).label).toBe('Waiting for the sender\'s computer');
    expect(carryLine(undefined)).toBeNull();
  });
});
