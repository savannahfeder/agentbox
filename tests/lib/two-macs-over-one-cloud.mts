// Two or three "Macs" over one in-memory cloud, for tests of what a message
// carries to the people on it. Each Mac has its own store and its own sync.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../../main/store/work-items.mts';
import { Store } from '../../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../../main/team/memory-cloud.mts';
import { createTeamService } from '../../main/team/index.mts';
import { memorySession } from '../../main/team/session.mts';
import { resolveArtifact } from '../../main/artifact-path.mts';

export { disk, createMemoryCloud, signUpMemory, memoryBackend, resolveArtifact };

export async function aMac(cloud, personId, { wrap = (b) => b, carrierOptions = { retryMs: [0, 0] } } = {}) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'carry-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const mac = { skew: 0 };
  const service = createTeamService({
    session: memorySession(() => wrap(memoryBackend(cloud, personId))),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000, carrierOptions, now: () => Date.now() + mac.skew,
  });
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  return Object.assign(mac, { personId, store, service, on, accountRoot, storeRoot });
}

export const conversation = (mac) => mac.store.listProducts().find((p) => p.team?.direct) ?? null;

export const opened = (mac, src, { product = conversation(mac), now = Date.now() } = {}) => resolveArtifact({
  src, product: product.slug, products: mac.store.listProducts(),
  accountRoot: mac.accountRoot, storeRoot: mac.storeRoot, now,
  nameOf: (id) => mac.service.firstNameOf(id),
});

export const bytesOf = async (mac, src) => {
  const r = await opened(mac, src);
  return r.ok ? fs.readFileSync(r.path) : null;
};

export function aProject(mac, name) {
  const { slug } = mac.store.createProduct({ name });
  const dir = mac.store.listProducts().find((p) => p.slug === slug).dir;
  return { slug, dir };
}

export function write(dir, rel, bytes) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return file;
}

/** Lets a pass or two go by until `ok()` says so; the big-file work goes on between passes. */
export async function until(macs, ok, { passes = 40 } = {}) {
  for (let i = 0; i < passes; i += 1) {
    for (const m of macs) await m.service.syncNow();
    if (await ok()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return !!(await ok());
}
