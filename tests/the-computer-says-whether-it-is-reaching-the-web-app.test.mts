// THE COMPUTER SAYS WHETHER IT IS REACHING THE WEB APP.
//
// What broke (found 2026-10-26 while asking why the web app "can't connect to
// the computer"): when this computer's pass to the online inbox failed, the
// team service kept the error in `phoneError` and nothing drew it. Settings ›
// Phone said only that replies wait until the computer wakes, so from either
// end a failing upload looked like a computer that was not there. Measured with
// the team service on the in-memory cloud, with its uploads made to fail.
import { it, expect, describe, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let dir, store, service, failing;

beforeEach(async () => {
  disk._internals.forgetFolds();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-health-'));
  const accountRoot = path.join(dir, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  store = await new Store({ storeRoot: dir, accountId: 'a', accountRoot, products: [] }).init();
  store.createProduct({ name: 'Alpha' });
  const cloud = createMemoryCloud();
  const me = signUpMemory(cloud, { email: 'owner@example.com' });
  failing = null;
  const backend = () => {
    const b = memoryBackend(cloud, me);
    const put = b.putPhoneProject.bind(b);
    b.putPhoneProject = async (row) => { if (failing) throw new Error(failing); return put(row); };
    return b;
  };
  service = createTeamService({
    session: memorySession(backend),
    store, disk, accountRoot, stateFile: path.join(dir, '.team-sync.json'), intervalMs: 3_600_000,
    phone: { projects: () => null, apply: async () => {}, stateFile: path.join(dir, '.phone-inbox.json') },
  });
  await service.signIn();
});
afterEach(async () => { await service.signOut(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('the computer\'s side of the web app', () => {
  it('notes when its threads last reached the web app', async () => {
    store.composeItem('alpha', { title: 'Fix the login page', body: 'It loops.' });
    await service.syncNow();
    expect(service.state().phoneSentAt).toEqual(expect.any(Number));
    expect(service.state().phoneError ?? null).toBeNull();
  });

  it('says why when they stop reaching it, and clears it once they do again', async () => {
    await service.syncNow();
    const first = service.state().phoneSentAt;
    failing = 'the cloud answered 500';
    // A second project makes the pass write again.
    store.createProduct({ name: 'Beta' });
    await service.syncNow();
    expect(service.state().phoneError).toBe('the cloud answered 500');
    expect(service.state().phoneSentAt).toBe(first);
    failing = null;
    await service.syncNow();
    expect(service.state().phoneError).toBeNull();
    expect(service.state().phoneSentAt).toBeGreaterThanOrEqual(first);
  });

  it('adds no push to the window of its own on a quiet pass', async () => {
    const pushesOverQuietPasses = async (phone, n) => {
      let changes = 0;
      const cloud = createMemoryCloud();
      const me = signUpMemory(cloud, { email: `quiet-${n}@example.com` });
      const s = createTeamService({
        session: memorySession(() => memoryBackend(cloud, me)),
        store, disk, accountRoot: path.join(dir, 'accounts', 'a'), stateFile: path.join(dir, `.team-sync-${n}.json`), intervalMs: 3_600_000,
        onChange: () => { changes += 1; },
        phone: phone ? { projects: () => null, apply: async () => {}, stateFile: path.join(dir, `.phone-inbox-${n}.json`) } : null,
      });
      await s.signIn();
      await s.syncNow();
      const before = changes;
      for (let i = 0; i < 5; i += 1) await s.syncNow();
      const sentAt = s.state().phoneSentAt;
      await s.signOut();
      return { pushes: changes - before, sentAt, afterSignOut: s.state().phoneSentAt ?? null };
    };
    const withPhone = await pushesOverQuietPasses(true, 2);
    const without = await pushesOverQuietPasses(false, 3);
    expect(withPhone.pushes).toBe(without.pushes);
    expect(withPhone.sentAt).toEqual(expect.any(Number));
    expect(withPhone.afterSignOut).toBeNull();
  });

  it('is drawn on Settings › Phone with the account it signs in as', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/phoneCloud=\{[^}]*email: snap\.team\.me\?\.email/);
    expect(app).toMatch(/sentAt: snap\.team\.phoneSentAt/);
    expect(app).toMatch(/error: snap\.team\.phoneError/);
    const settings = read('renderer/src/components/Settings.tsx');
    expect(settings).toContain('Not reaching the web app');
    expect(settings).toContain('Connected as');
  });
});
