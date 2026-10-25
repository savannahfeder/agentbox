// EVERY THREAD THE CLOUD CAN RUN OFFERS "KEEP ON THIS MAC" IN ITS MENU.
//
// What was asked (2026-10-21): "Quite often I want to make a thread run
// locally but it doesn't give me this option ... This one does but a lot of
// others don't." Measured by reading both rules: the menu's row (threadPlace,
// renderer/src/cloud-menu.ts) was drawn only for a project with a code folder,
// but since 2026-10-20 the cloud also runs projects without one
// (tests/a-project-with-no-code-folder-runs-in-the-cloud). That was Personal,
// My Workspace and Direct, 17 of 31 open threads, all running in the cloud
// with no way to keep one here.
//
// Now the supervisor says which projects the cloud may run, by the rule it
// places threads with, and the menu reads that instead of keeping its own.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { noteImageCaps } from '../main/cloud/config.mjs';
import { threadPlace } from '../renderer/src/cloud-menu.ts';

const CAPS = ['offline', 'setup', 'kept', 'base', 'plain'];
const savedConfigEnv = process.env.AGENTBOX_CLOUD_CONFIG;

let tmp; let cloudConfig; let products;
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'keephere-')));
  products = [
    { slug: 'coded', repoPath: path.join(tmp, 'repo'), dir: path.join(tmp, 'coded') },
    { slug: 'notes', repoPath: null, dir: path.join(tmp, 'notes') },
    { slug: 'nowhere', repoPath: null, dir: null },
    { slug: 'mine', repoPath: null, dir: path.join(tmp, 'mine') },
  ];
  const cfg = path.join(tmp, 'cloud.json');
  cloudConfig = { region: 'us-east-1', bucket: 'b', runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/x' };
  fs.writeFileSync(cfg, JSON.stringify(cloudConfig));
  process.env.AGENTBOX_CLOUD_CONFIG = cfg;
});
afterEach(() => {
  if (savedConfigEnv === undefined) delete process.env.AGENTBOX_CLOUD_CONFIG; else process.env.AGENTBOX_CLOUD_CONFIG = savedConfigEnv;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const build = ({ caps = CAPS, cloudRuns = 'all' } = {}) => {
  noteImageCaps(cloudConfig, caps);
  return new Supervisor(
    { home: '/nonexistent-home', storeRoot: path.join(tmp, 'store'), maxConcurrentSessions: 2, cloudRuns, personalProducts: ['mine'] },
    { listItems: () => [], listProducts: () => products, isDue: () => true },
    path.join(tmp, 'app'), path.join(tmp, 'app'), path.join(tmp, 'user'),
  );
};
const row = (product, extra = {}) => ({ id: `w-${product}`, product, ...extra });

describe('the menu row on a thread that is on this Mac now', () => {
  it('is there on a project with no code folder once the cloud can run one', () => {
    const cloud = build().cloudStatus();
    expect(threadPlace(row('notes'), null, cloud)).toBe('here');
    expect(threadPlace(row('coded'), null, cloud)).toBe('here');
  });

  it('is not there on that project while the cloud image cannot run it', () => {
    const cloud = build({ caps: CAPS.filter((c) => c !== 'plain') }).cloudStatus();
    expect(threadPlace(row('notes'), null, cloud)).toBe(null);
    expect(threadPlace(row('coded'), null, cloud)).toBe('here');
  });

  it('is not there on a project the cloud never takes, or with the cloud off', () => {
    const cloud = build().cloudStatus();
    expect(threadPlace(row('nowhere'), null, cloud)).toBe(null);
    expect(threadPlace(row('mine'), null, cloud)).toBe(null);
    expect(threadPlace(row('notes'), null, build({ cloudRuns: false }).cloudStatus())).toBe(null);
  });

  it('still says where a thread is when it is in the cloud or kept here', () => {
    const cloud = build().cloudStatus();
    expect(threadPlace(row('notes'), { where: 'cloud' }, cloud)).toBe('cloud');
    expect(threadPlace(row('notes', { onMac: true }), null, cloud)).toBe('kept');
  });
});

describe('the menu and the cloud', () => {
  it('agree on every project which threads the cloud may take', () => {
    for (const caps of [CAPS, CAPS.filter((c) => c !== 'plain')]) {
      const sup = build({ caps });
      const cloud = sup.cloudStatus();
      for (const p of products) {
        expect({ slug: p.slug, caps: caps.length, menu: threadPlace(row(p.slug), null, cloud) === 'here' })
          .toEqual({ slug: p.slug, caps: caps.length, menu: sup._cloudEligible(row(p.slug)) });
      }
    }
  });

  it('lists no project where the cloud is not set up', () => {
    const sup = build();
    delete process.env.AGENTBOX_CLOUD_CONFIG;
    const cloud = sup.cloudStatus();
    expect(cloud.setUp).toBe(false);
    expect(cloud.projects).toEqual([]);
    expect(threadPlace(row('coded'), null, cloud)).toBe(null);
  });
});
