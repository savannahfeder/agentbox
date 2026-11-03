// CONNECTIONS, STARTED FOR ONE COPY OF THE APP: where its file goes, what seals
// it, and the broker its workers reach it through.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { catalogFor, clockAt, onLoopback } from '../../shared/connections-catalog.mjs';
import { sessionFileOutsideStore } from '../team/session.mjs';
import { createBroker } from './broker.mjs';
import { createCopies } from './copies.mjs';
import { createConnections } from './index.mjs';

/** Keeps to macOS's 104 bytes for a socket path, and to this store's copy of the app. */
export function brokerSocketPath(storeRoot) {
  const tag = crypto.createHash('sha256').update(path.resolve(storeRoot)).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), `agentbox-conn-${tag}.sock`);
}

// A browser copy has no keychain, so it refuses a real connection. A copy on the
// fixture may seal with a key file beside the sealed one: no real sign-in is
// behind it, and `testOnlyFor` keeps Linear off it.
export function fixtureCipher(keyFile) {
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32), { mode: 0o600 });
  const key = fs.readFileSync(keyFile);
  return {
    available: () => true,
    encrypt: (text) => {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), body]);
    },
    decrypt: (raw) => {
      const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12), { authTagLength: 16 });
      d.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
    },
  };
}

/** The Needs you row that says a connection that was out works again. */
export function recoveryRow({ name, since, at, before }, now = Date.now()) {
  const title = `${name} ${before ? 'works again' : 'works now'}`;
  const problem = `${name} was out from ${clockAt(since, now)} and answered at ${clockAt(at, now)}.`;
  return { title, problem, body: 'Agents can use it again. A thread that stopped because of it can be told to go on.' };
}

/** Where that row goes: the project whose run last met the connection, or the first project that is not a chat. */
export function recoveryProduct(store, lastProduct) {
  let products = [];
  try { products = store.listProducts(); } catch { return null; }
  if (lastProduct && products.some((p) => p.slug === lastProduct)) return lastProduct;
  return products.find((p) => !p.team?.direct)?.slug ?? null;
}

/** A row that asked for this sign-in is untrue once it is back, and Needs you is the one list a person reads. */
export function closeSignInRows(store, name) {
  const asked = new Set([`Sign in to ${name} again`, `${name} signs out soon`]);
  for (const item of store.listAllWorkItems()) {
    if (!asked.has(item.title) || item.status === 'done') continue;
    store.modules.workItemsDisk.updateWorkItem(store.productDir(item.product), item.id, { status: 'done' }, { source: 'system' });
  }
}

export function startConnections({ config, supervisor, appDir, userDir, cipher = null, openExternal, packaged = false, env = process.env, onChange = () => {}, onWhoChanged = () => {} }) {
  const vaultFile = sessionFileOutsideStore({ dir: userDir, name: 'connections.enc', storeRoot: config.storeRoot });
  const catalog = catalogFor({ env, packaged });
  const onFixture = catalog.some((e) => e.id === 'test-tracker' || e.standin);
  let sealedWith = cipher;
  let testOnlyFor = null;
  let open = openExternal;
  if (!cipher && onFixture) {
    sealedWith = fixtureCipher(`${vaultFile}.test-key`);
    // The sealing key sits beside the file here, so only a tool on this machine may use it.
    testOnlyFor = (entry) => onLoopback(entry.address);
  }
  // A test copy must not put the sign-in screen in front of whoever owns this Mac.
  if (onFixture && env.AGENTBOX_TOOLS_FIXTURE_OPEN) open = async (url) => { fs.writeFileSync(env.AGENTBOX_TOOLS_FIXTURE_OPEN, url); };
  let lastProduct = null;
  let copies = null;
  const inNeedsYou = (row) => {
    const slug = recoveryProduct(supervisor.store, lastProduct);
    if (slug) supervisor.store.fileItem(slug, row);
  };
  const connections = createConnections({
    vaultFile, cipher: sealedWith, catalog, openExternal: open, testOnlyFor,
    allowLoopback: onFixture && !packaged,
    personId: () => env.AGENTBOX_PERSON_ID ?? null,
    onChange,
    onWhoChanged,
    onNeedsYou: inNeedsYou,
    onSignedIn: (entry) => closeSignInRows(supervisor.store, entry.name),
    onRecovered: (back) => {
      const slug = recoveryProduct(supervisor.store, lastProduct);
      if (slug) supervisor.store.fileItem(slug, recoveryRow(back));
      void copies?.kick(back.id)?.catch?.(() => {});
    },
  });
  copies = createCopies({
    connections, store: supervisor.store, stateFile: `${vaultFile}.copies.json`, onChange, onNeedsYou: inNeedsYou,
  });
  const broker = createBroker({
    connections, storeRoot: config.storeRoot, socketPath: brokerSocketPath(config.storeRoot),
    proxyFile: path.join(appDir, 'mcp', 'connection-proxy.mjs'),
  });
  // A run that starts before this is listening finds its tool says offline, and the next call finds it back.
  broker.listen().catch((err) => console.warn('zero: connections are not reachable by agents:', err?.message ?? err));
  const openRun = (run) => { if (run?.item?.product) lastProduct = run.item.product; return broker.openRun(run); };
  supervisor.connections = { catalog, workingNow: connections.workingNow, statusNow: connections.statusNow, copiesNow: copies.now, openRun };
  connections.startRetrying();
  copies.schedule();
  return { connections, copies, stop: () => Promise.all([copies.stop(), connections.stop(), broker.stop()]) };
}
