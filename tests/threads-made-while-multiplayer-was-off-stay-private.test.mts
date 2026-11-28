// THREADS MADE WHILE MULTIPLAYER WAS OFF STAY PRIVATE.
//
// On 2026-11-26 the Alpha features page went and multiplayer turned on for
// everyone, with the saved switch no longer read. A code review on 2026-11-27
// found that someone on a team who had switched it off then shared threads they
// had made meanwhile: from the phone, repeating tasks or the terminal, with no
// word of their own on who sees them, so they followed the project to the team.
// Only threads made in the window had been marked private. The founder chose to
// keep those private (2026-11-28). The old switch is read once: if it was off,
// the moment sharing starts moves to then, and a thread from before it with no
// word of its own stays yours, as one from before you joined already does.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { multiplayerWasOff } from '../main/settings.mts';
import { configFile } from '../main/config.mts';
import { shownToTeam } from '../shared/thread-cards.mts';

describe('the old switch, read once', () => {
  let appDir: string;
  beforeEach(() => { appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-off-')); });
  afterEach(() => fs.rmSync(appDir, { recursive: true, force: true }));
  const configWith = (saved: object) => {
    fs.writeFileSync(configFile(appDir), JSON.stringify(saved));
    return { appDir, ...saved };
  };
  const onDisk = () => JSON.parse(fs.readFileSync(configFile(appDir), 'utf8'));

  it('says multiplayer was off, then forgets it', () => {
    const config = configWith({ alphaMultiplayer: false, alphaTeammates: true });
    expect(multiplayerWasOff(config)).toBe(true);
    expect(onDisk()).toEqual({ alphaTeammates: true });
    expect(multiplayerWasOff(config)).toBe(false);
  });
  it('says nothing for someone who had it on, or never chose', () => {
    expect(multiplayerWasOff(configWith({ alphaMultiplayer: true }))).toBe(false);
    expect(onDisk()).toEqual({ alphaMultiplayer: true });
    expect(multiplayerWasOff(configWith({}))).toBe(false);
  });
});

describe('a team member who had multiplayer off', () => {
  let cloud: ReturnType<typeof createMemoryCloud>;
  let storeRoot: string;
  let mayaId: string;
  const macFor = async (sharedFromNow?: () => boolean) => {
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    fs.mkdirSync(accountRoot, { recursive: true });
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    return createTeamService({
      session: memorySession(() => memoryBackend(cloud, mayaId)),
      store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
      ...(sharedFromNow ? { sharedFromNow } : {}),
    });
  };
  beforeEach(() => {
    disk._internals.forgetFolds();
    cloud = createMemoryCloud();
    storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-off-team-'));
    mayaId = signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' });
  });
  afterEach(() => fs.rmSync(storeRoot, { recursive: true, force: true }));

  const joined = async () => {
    const first = await macFor();
    await first.signIn();
    await first.createTeam('Lumen');
    const since = first.state().since!;
    first.stop?.();
    return since;
  };
  const madeBetween = (since: number) => ({ visibility: undefined, createdAt: since + 1 });
  const teamProject = { team: { sharedBy: 'someone', seenBy: 'team' } };

  it('shares only what is made from the first launch on', async () => {
    const before = await joined();
    await new Promise((r) => setTimeout(r, 5));
    const mac = await macFor(() => true);
    await mac.signIn();
    const since = mac.state().since!;
    expect(since).toBeGreaterThan(before);
    expect(shownToTeam(madeBetween(before) as never, since, teamProject as never)).toBe(false);
    expect(shownToTeam({ createdAt: since + 1 } as never, since, teamProject as never)).toBe(true);
    mac.stop?.();
  });
  it('keeps a thread they had said the team sees', () => {
    expect(shownToTeam({ visibility: 'team', createdAt: 1 } as never, 2, teamProject as never)).toBe(true);
  });
  it('leaves everyone else sharing from when they joined', async () => {
    const before = await joined();
    await new Promise((r) => setTimeout(r, 5));
    const mac = await macFor(() => false);
    await mac.signIn();
    expect(mac.state().since).toBe(before);
    mac.stop?.();
  });
});

describe('the app reads the old switch for the team service', () => {
  it('on the desktop and in the browser copy', () => {
    for (const f of ['main/main.mts', 'main/serve.mts']) {
      const src = fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
      expect(src, f).toMatch(/sharedFromNow: \(\) => multiplayerWasOff\(config\)/);
    }
  });
});
