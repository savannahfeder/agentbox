// Two copies of the app over one memory cloud. Maya's store is the one the store
// tools read (the throwaway home), so an agent's tool call and the app's tick
// meet on the same files, as they do on a real Mac.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../../main/store/work-items.mts';
import { appHome } from '../../main/store/home.mts';
import { Store } from '../../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../../main/team/memory-cloud.mts';
import { createTeamService } from '../../main/team/index.mts';
import { memorySession } from '../../main/team/session.mts';
import { UNDO_HOLD_MS } from '../../shared/teammate-reach.mts';

const rand = () => Math.random().toString(36).slice(2, 8);

async function aCopy(cloud, personId, { storeRoot, accountId, accountRoot, ownMates = null }) {
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId, accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, `.team-sync-${personId}.json`), intervalMs: 3_600_000,
    ...(ownMates ? { ownMates: () => ownMates(store) } : {}),
  });
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  return { personId, store, service, on };
}

export async function aTeamWithAgents({ ownMates = null } = {}) {
  disk._internals.forgetFolds();
  const cloud = createMemoryCloud();
  const home = appHome();
  const accountId = `acct-${rand()}`;
  process.env.STORE_ACCOUNT_ID = accountId;
  const accountRoot = path.join(home, 'accounts', accountId);
  fs.mkdirSync(accountRoot, { recursive: true });
  const { resolveAccount } = await import('../../mcp/core/account.mts');
  resolveAccount();
  const { createProduct } = await import('../../mcp/core/products.mts');
  const product = createProduct(`Lumen ${rand()}`);

  const mayaId = signUpMemory(cloud, { email: `maya-${rand()}@lumen.test`, name: 'Maya Chen' });
  const devId = signUpMemory(cloud, { email: `dev-${rand()}@lumen.test`, name: 'Dev Patel' });
  const sofiaId = signUpMemory(cloud, { email: `sofia-${rand()}@lumen.test`, name: 'Sofia Reyes' });
  const elsewhere = () => {
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-'));
    return { storeRoot, accountId: 'a', accountRoot: path.join(storeRoot, 'accounts', 'a') };
  };
  const maya = await aCopy(cloud, mayaId, { storeRoot: home, accountId, accountRoot, ownMates });
  const dev = await aCopy(cloud, devId, elsewhere());
  const sofia = await aCopy(cloud, sofiaId, elsewhere());
  await maya.service.signIn();
  await maya.service.createTeam('Lumen');
  for (const c of [dev, sofia]) {
    await maya.service.invite(cloud.people.get(c.personId).email);
    await c.service.signIn();
    await c.service.acceptInvite(maya.service.state().team.id);
  }
  await maya.service.syncNow();

  const told = [];
  const tell = async (slug, id, { text, from }) => {
    told.push({ id, text, from });
    await maya.on(() => maya.store.tellItem(slug, id, { text, from }));
  };
  // One pass of what the app's tick does for reaching people.
  const tick = (now = Date.now()) => maya.on(() => maya.store.teammates.reach({
    team: maya.service, items: maya.store.listItems(now), now, tell,
  }));
  // A message to someone already allowed waits UNDO_HOLD_MS before it goes:
  // a tick now, then one past the hold.
  const tickPastUndo = async (now = Date.now()) => { await tick(now); await tick(now + UNDO_HOLD_MS); };
  // And what the tick does for AI teammates: a pass becomes a run.
  const wake = (now = Date.now()) => maya.on(() => maya.store.teammates.tick({
    items: maya.store.listItems(now), now, deliver: async () => {}, tell,
  }));
  const rows = (copy) => copy.store.listItems();
  const conversationsOf = (copy) => {
    const direct = new Set(copy.store.listProducts().filter((p) => p.team?.direct).map((p) => p.slug));
    return rows(copy).filter((i) => direct.has(i.product));
  };
  const stop = async () => {
    for (const c of [maya, dev, sofia]) await c.service.signOut();
    delete process.env.STORE_ACCOUNT_ID;
    delete process.env.ZERO_ITEM;
    delete process.env.ZERO_PRODUCT;
    disk.setLineAuthor(null);
  };
  return { cloud, maya, dev, sofia, product, told, tell, tick, tickPastUndo, wake, rows, conversationsOf, stop, accountId };
}
