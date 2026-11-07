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
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mjs';
import { linkSiteFor, versionInName } from '../main/file-link.mjs';
import { familyKeyOf } from '../shared/artifact-marks.mjs';
import { PHONE_SITE } from '../shared/cloud-address.mjs';
import { linkOffer, canShareFile, shareWords, afterSharing } from '../renderer/src/components/ShareLink.tsx';
import { clock } from '../renderer/src/thread-history.ts';

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

  // A link made a minute ago said "Link updated" (power test, round 3, 2026-11-04).
  it('says when the link was made, and when it was last given a newer copy', async () => {
    let now = Date.parse('2026-11-04T09:00:00Z');
    cloud.now = () => now;
    const made = (await maya.shareFile(file(1))).link;
    expect(made.createdAt).toBe(made.updatedAt);
    expect(shareWords.shared(made, now)).toBe(`Shared today at ${clock(now)}`);
    now += 3_600_000;
    const later = (await maya.shareFile(file(2))).link;
    expect(later.createdAt).toBe(made.createdAt);
    expect(later.updatedAt).toBe(now);
    expect(shareWords.shared(later, now)).toBe(`Updated today at ${clock(now)}`);
    expect(shareWords.shared(later, now + 2 * 86_400_000)).toBe('Updated Nov 4');
  });

  // Two sharers had no one place to see what they had made public (power test, round 3).
  it('lists every live link, newest first, with its address, and none once stopped', async () => {
    let now = Date.parse('2026-11-04T09:00:00Z');
    cloud.now = () => now;
    const first = (await maya.shareFile(file(1))).link;
    now += 60_000;
    await maya.shareFile({ ...file(1), source: 'agentbox-team/w-2/pricing.html', name: 'pricing.html', kind: 'page', type: 'text/html' });
    const { links } = await maya.fileLinks();
    expect(links.map((l) => l.name)).toEqual(['pricing.html', 'plan.md']);
    expect(links[1]).toMatchObject({ token: first.token, url: first.url, comments: 0, kind: 'markdown' });
    await maya.stopFileLink(first.token);
    expect((await maya.fileLinks()).links.map((l) => l.name)).toEqual(['pricing.html']);
  });

  it('says when the link holds a newer version than the one on screen, so it is not offered an older one', async () => {
    await maya.shareFile(file(3));
    const { link } = await maya.fileLink(SOURCE, 'h1', 1);
    expect(link).toMatchObject({ current: false, ahead: true });
    expect(linkOffer({ ok: true, link }).behind).toBe(false);
    expect((await maya.fileLink(SOURCE, 'h4', 4)).link).toMatchObject({ current: false, ahead: false });
    expect(shareWords.ahead(3)).toBe('The link shows version 3, newer than this one.');
    // Two investors' testers did not know the comments were public (round 4).
    expect(shareWords.fresh).toBe('Make a link anyone can open, without an account. Its comments are public too.');
    // Signed out, a file with a live link read as if nothing were shared (power test, round 3).
    expect(shareWords.signedOut).toBe('Sign in to share this file or see its link.');
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

// "Update link also silently copied the link to my clipboard" (power test, round 3, 2026-11-04).
it('copies a new link, and leaves the clipboard alone when it updates one', async () => {
  let copied = 0;
  const copyIt = async () => { copied += 1; return true; };
  expect(await afterSharing(false, copyIt)).toBe('Link copied');
  expect(await afterSharing(true, copyIt)).toBe('Link updated');
  expect(copied).toBe(1);
  expect(await afterSharing(false, async () => false)).toBeNull();
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

// A tester could not tell which files were public: the mark only turned a shade brighter (power test, round 3, 2026-11-04).
it('a file with a live link keeps its mark washed, as a toggle that is on', () => {
  const css = fs.readFileSync(new URL('../renderer/src/components/artifact-view.css', import.meta.url), 'utf8');
  const rule = /\.av-share \.doc-mark\.is-shared\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  expect(rule).toMatch(/background:\s*var\(--doc-wash\)/);
});
