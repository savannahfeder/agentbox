// SHARING A FILE AGAIN KEEPS ITS LINK, AND STOPPING IT ENDS IT.
//
// Shareable files (w-d7e61eb261). The Share button in a file opened big asks
// the team service for the file's link, makes it, puts a newer version in it
// and stops it. Measured here against the memory cloud the stand-in serves,
// with the same calls the database half answers
// (a-shared-file-link-shows-strangers-that-file-and-nothing-else): the link
// stays one address across versions, a stopped one is a new address next
// time, nobody signed out can share, and a copy whose cloud has no website
// offers nothing.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';
import { linkSiteFor, versionInName } from '../main/file-link.mjs';
import { familyKeyOf } from '../shared/artifact-marks.mjs';
import { PHONE_SITE } from '../shared/cloud-address.mjs';
import { linkOffer, canShareFile } from '../renderer/src/components/ShareLink.tsx';

async function aMac(cloud, personId, site = 'https://app.agentbox.ac') {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'file-link-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  return createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
    shareSite: site,
  });
}
const SOURCE = 'agentbox-team/w-1/plan.md';
const file = (v, body = `# Plan v${v}`) => ({ source: SOURCE, name: 'plan.md', kind: 'markdown', type: 'text/markdown', body, version: v, hash: `h${v}` });

let cloud, maya;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' }));
});

describe('signed in', () => {
  beforeEach(() => maya.signIn());

  it('a file with no link says so, then shares to an address on the site', async () => {
    expect(await maya.fileLink(SOURCE)).toEqual({ site: 'https://app.agentbox.ac', signedIn: true, link: null });
    const made = await maya.shareFile(file(1));
    expect(made.link.url).toMatch(/^https:\/\/app\.agentbox\.ac\/f\/[0-9a-f]{40}$/);
    expect(made.link).toMatchObject({ version: 1, comments: 0 });
  });

  it('a newer version goes into the same link', async () => {
    const first = (await maya.shareFile(file(1))).link;
    const second = (await maya.shareFile(file(3))).link;
    expect(second.url).toBe(first.url);
    expect(second.version).toBe(3);
    expect([...cloud.fileLinks.values()][0].body).toBe('# Plan v3');
  });

  it('says whether the link holds the copy on screen', async () => {
    await maya.shareFile(file(1));
    expect((await maya.fileLink(SOURCE, 'h1')).link.current).toBe(true);
    expect((await maya.fileLink(SOURCE, 'h2')).link.current).toBe(false);
    expect((await maya.fileLink(SOURCE, null)).link.current).toBe(true);
  });

  it('stopping ends the link, and sharing again makes a new one', async () => {
    const first = (await maya.shareFile(file(1))).link;
    await maya.stopFileLink(first.token);
    expect((await maya.fileLink(SOURCE)).link).toBeNull();
    expect(cloud.fileLinks.get(first.token)).toMatchObject({ body: '' });
    expect((await maya.shareFile(file(1))).link.url).not.toBe(first.url);
  });

  it('another person cannot stop it', async () => {
    const first = (await maya.shareFile(file(1))).link;
    const jun = memoryBackend(cloud, signUpMemory(cloud, { email: 'jun@else.test', name: 'Jun' }));
    await jun.stopFileLink(first.token);
    expect((await maya.fileLink(SOURCE)).link?.token).toBe(first.token);
  });

  // Two testers could not read or answer comments without leaving the app (power test, 2026-11-04).
  it('reads the comments people left on the page, and answers them as the owner', async () => {
    const { link } = await maya.shareFile(file(1));
    const chris = memoryBackend(cloud, signUpMemory(cloud, { email: 'chris@else.test', name: 'Chris Novak' }));
    await chris.commentOnFileLink(link.token, 'Can you send the Q3 numbers?');
    expect(await maya.fileLinkComments(link.token)).toMatchObject([{ byName: 'Chris Novak', text: 'Can you send the Q3 numbers?', byOwner: false, mine: false }]);
    const after = await maya.commentOnFileLink(link.token, '  Adding them now  ');
    expect(after.map((c) => [c.byName, c.text, c.byOwner])).toEqual([['Chris Novak', 'Can you send the Q3 numbers?', false], ['Maya Chen', 'Adding them now', true]]);
    expect((await maya.fileLink(SOURCE)).link.comments).toBe(2);
    await expect(maya.commentOnFileLink(link.token, '   ')).rejects.toThrow(/Write something/);
  });

  it('refuses what a link cannot draw', async () => {
    await expect(maya.shareFile({ ...file(1), kind: 'film' })).rejects.toThrow(/cannot draw/);
  });
});

it('signed out, it says so and shares nothing', async () => {
  expect(await maya.fileLink(SOURCE)).toEqual({ site: 'https://app.agentbox.ac', signedIn: false, link: null });
  await expect(maya.shareFile(file(1))).rejects.toThrow(/Sign in/);
  expect(cloud.fileLinks.size).toBe(0);
});

it('a cloud with no website offers no link at all', async () => {
  const bare = await aMac(cloud, signUpMemory(cloud, { email: 'x@else.test', name: 'X' }), null);
  await bare.signIn();
  expect((await bare.fileLink(SOURCE)).site).toBeNull();
  await expect(bare.shareFile(file(1))).rejects.toThrow(/no website/);
});

it('links on our cloud read as app.agentbox.ac, whichever address the phone site has', () => {
  expect(linkSiteFor(PHONE_SITE)).toBe('https://app.agentbox.ac');
  expect(linkSiteFor('https://app.agentbox.ac/')).toBe('https://app.agentbox.ac');
  expect(linkSiteFor('https://phone.other-team.test')).toBe('https://phone.other-team.test');
  expect(linkSiteFor(null)).toBeNull();
  expect(linkSiteFor('http://phone.other-team.test')).toBeNull();
  expect(linkSiteFor('https://x.test/some/path')).toBeNull();
});

// A copy on a stand-in cloud shares onto a site served on this computer, which
// has no certificate; testers open those links the way a stranger would.
it('takes a site on this computer over plain http, and no other plain http', () => {
  expect(linkSiteFor('http://127.0.0.1:8788')).toBe('http://127.0.0.1:8788');
  expect(linkSiteFor('http://localhost:8788/')).toBe('http://localhost:8788');
  expect(linkSiteFor('http://127.0.0.1.evil.test:8788')).toBeNull();
  expect(linkSiteFor('http://localhost.evil.test')).toBeNull();
  expect(linkSiteFor('http://10.0.0.5:8788')).toBeNull();
});

it('the panel offers Update link when the link holds another copy', () => {
  const link = { token: 't', url: 'u', version: 2, updatedAt: 0, comments: 0, current: true };
  expect(linkOffer({ ok: true, link })).toEqual({ link, behind: false });
  expect(linkOffer({ ok: true, link: { ...link, current: false } }).behind).toBe(true);
  expect(linkOffer({ ok: true, link: null })).toEqual({ link: null, behind: false });
});

it('every version of a file is one link, and only kinds a link can draw are offered', () => {
  expect(familyKeyOf('designs/w-1/plan-v3.md')).toBe(familyKeyOf('designs/w-1/plan.md'));
  expect(familyKeyOf('designs/w-1/plan.md')).not.toContain('\0');
  expect(familyKeyOf('designs/w-1/other.md')).not.toBe(familyKeyOf('designs/w-1/plan.md'));
  expect(versionInName('plan-v3.md')).toBe(3);
  expect(versionInName('plan.md')).toBe(1);
  for (const yes of ['a.md', 'b.HTML', 'c.png', 'd.jpeg', 'e.pdf', 'f.svg']) expect(canShareFile(yes), yes).toBe(true);
  for (const no of ['a.mp4', 'b.csv', 'c.ts', 'd']) expect(canShareFile(no), no).toBe(false);
});
