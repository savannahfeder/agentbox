// SHARING A FILE NEEDS AN ACCOUNT, NOT MULTIPLAYER.
//
// A note said sharing needs Settings › Alpha features › Multiplayer, which a
// download had off. Read on 2026-11-12: a download has had it on since
// 2026-11-09, and a file's Share link never asked the switch: the link calls
// in main/ipc.mts and the team service's fileLink and shareFile read only the
// sign-in. This pins that, with the switch off and no team, and pins what a
// person with no account meets: for someone who skipped signing in, Share
// offers Create account and its page opens there; for anyone else, Sign in.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService, teamForWindow } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { shareSignInStartsOn } from '../renderer/src/sign-in-ask.ts';
import { shareSignedOutWords, shareWords } from '../renderer/src/public-link-words.ts';

const SITE = 'https://app.agentbox.ac';
const SOURCE = 'agentbox-team/w-1/plan.md';
const plan = { source: SOURCE, name: 'plan.md', kind: 'markdown', type: 'text/markdown', body: '# Plan', version: 1, hash: 'h1' };

async function aMacWithMultiplayerOff(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'share-no-mp-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  return createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
    shareSite: SITE,
    sharing: () => false,
  });
}

let cloud: ReturnType<typeof createMemoryCloud>;
let mac: Awaited<ReturnType<typeof aMacWithMultiplayerOff>>;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  mac = await aMacWithMultiplayerOff(cloud, signUpMemory(cloud, { email: 'ines@solo.test', name: 'Ines Duarte' }));
});

describe('with Multiplayer off and no team', () => {
  it('a signed-in person shares a file to a link anyone can open', async () => {
    await mac.signIn();
    expect(mac.state().team).toBeNull();
    const made = await mac.shareFile(plan);
    expect(made.link.url).toMatch(/^https:\/\/app\.agentbox\.ac\/f\/[0-9a-f]{40}$/);
    expect((await mac.fileLink(SOURCE)).signedIn).toBe(true);
  });

  it('the window still knows who is signed in, so Share draws its link panel', async () => {
    await mac.signIn();
    const seen = teamForWindow(mac.state(), false)!;
    expect(seen.signedIn).toBe(true);
    expect(seen.me?.id).toBeTruthy();
  });

  it('a signed-out person is offered a sign-in rather than nothing', async () => {
    expect(await mac.fileLink(SOURCE)).toEqual({ site: SITE, signedIn: false, link: null });
    const seen = teamForWindow(mac.state(), false)!;
    expect(seen.signedIn).toBe(false);
    expect(seen.canSignIn).toBe(true);
    await expect(mac.shareFile(plan)).rejects.toThrow(/Sign in to share/);
  });
});

describe("Share, for someone with no account", () => {
  it('opens on Create account, and says so, for someone who skipped signing in', () => {
    expect(shareSignInStartsOn({ skipped: true })).toBe('sign-up');
    expect(shareSignedOutWords('sign-up')).toEqual({ line: 'Create an account to share this file.', button: 'Create account' });
  });

  it('opens on Sign in for anyone who did not skip, as someone signed out has an account', () => {
    expect(shareSignInStartsOn({ skipped: false })).toBe('sign-in');
    expect(shareSignedOutWords('sign-in')).toEqual({ line: shareWords.signedOut, button: 'Sign in' });
  });
});
