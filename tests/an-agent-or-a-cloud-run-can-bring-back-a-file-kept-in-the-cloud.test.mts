// AN AGENT, OR A CLOUD RUN, CAN BRING BACK A FILE KEPT IN THE CLOUD.
//
// Once old pictures, films and sound in a project's folders leave the Mac
// (main/files-cloud.mts), a thread brings its own folder back when it starts
// and the window brings back what the person opens. An agent reading another
// thread's old folder found nothing there and no way to ask, and a cloud
// run's request for such a file answered not_found. Both now ask by path, and
// a folder brings back what left it. Measured with a real keeper over a cloud
// in memory, the store server's own tool, and the ask and answer on disk
// between it and the app.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filesKeeper } from '../main/files-cloud.mts';
import { answerFileAsks, askToBringBack, bringBackAt, setFilesComeBack } from '../main/files-come-back.mts';

const DAY = 24 * 60 * 60_000;
const sha = (b: string) => crypto.createHash('sha256').update(b).digest('hex');
let root: string;
let docs: string;
let asks: string;

async function offTheMac(files: Record<string, string>) {
  const held = new Map<string, Buffer>();
  const storage = {
    async putFile(k: string, f: string) { held.set(k, fs.readFileSync(f)); },
    async getToFile(k: string, f: string) { const b = held.get(k); if (!b) return false; fs.writeFileSync(f, b); return true; },
    async exists(k: string) { return held.has(k); },
    async del(k: string) { held.delete(k); },
  };
  let t = Date.UTC(2026, 10, 22);
  const keeper = filesKeeper({ dir: path.join(root, 'keeper'), storage: async () => storage, account: async () => ({ cap: 1e12, bytes: 0, full: false }), settings: () => ({ on: true, offAfterDays: 7 }), now: () => t });
  const versions = Object.entries(files).map(([rel, body]) => {
    const p = path.join(docs, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
    return { hash: sha(body), size: body.length, paths: [p], kind: 'image', at: t, name: path.basename(p), movable: true };
  });
  await keeper.pass(versions);
  t += 8 * DAY;
  await keeper.pass(versions);
  for (const v of versions) expect(fs.existsSync(v.paths[0])).toBe(false);
  setFilesComeBack(() => keeper);
  return keeper;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'come-back-'));
  docs = path.join(root, 'product');
  asks = path.join(root, 'asks');
});
afterEach(() => { setFilesComeBack(() => null); fs.rmSync(root, { recursive: true, force: true }); });

describe('bringing back by path', () => {
  it('brings back one file asked for by its path, and nothing beside it', async () => {
    await offTheMac({ 'designs/w-a/a.png': 'a', 'designs/w-a/b.png': 'b' });
    const out = await bringBackAt(path.join(docs, 'designs/w-a/a.png'));
    expect(out.back).toEqual([path.join(docs, 'designs/w-a/a.png')]);
    expect(fs.readFileSync(path.join(docs, 'designs/w-a/a.png'), 'utf8')).toBe('a');
    expect(fs.existsSync(path.join(docs, 'designs/w-a/b.png'))).toBe(false);
  });

  it('brings back everything that left a folder, and not a folder whose name starts the same', async () => {
    await offTheMac({ 'designs/w-a/a.png': 'a', 'designs/w-a/shots/b.png': 'b', 'designs/w-ab/c.png': 'c' });
    const out = await bringBackAt(path.join(docs, 'designs/w-a'));
    expect(out.back.sort()).toEqual([path.join(docs, 'designs/w-a/a.png'), path.join(docs, 'designs/w-a/shots/b.png')]);
    expect(fs.existsSync(path.join(docs, 'designs/w-ab/c.png'))).toBe(false);
  });

  it('says so when nothing at the path is in the cloud', async () => {
    await offTheMac({ 'designs/w-a/a.png': 'a' });
    expect(await bringBackAt(path.join(docs, 'designs/w-b'))).toEqual({ back: [], failed: [] });
  });
});

describe('an agent\'s ask, answered by the app', () => {
  it('brings back the files asked for, by full path or by one inside a project folder', async () => {
    await offTheMac({ 'designs/w-a/a.png': 'a', 'designs/w-b/b.png': 'b' });
    const app = setInterval(() => { void answerFileAsks({ dir: asks, bases: () => [docs] }); }, 20);
    try {
      const out = await askToBringBack({ dir: asks, paths: [path.join(docs, 'designs/w-a/a.png'), 'designs/w-b', 'designs/w-none'], cwd: root, waitMs: 5000 });
      expect(out.status).toBe('back');
      expect(out.back.sort()).toEqual([path.join(docs, 'designs/w-a/a.png'), path.join(docs, 'designs/w-b/b.png')]);
      expect(out.notInCloud).toEqual(['designs/w-none']);
      expect(fs.readFileSync(path.join(docs, 'designs/w-b/b.png'), 'utf8')).toBe('b');
    } finally { clearInterval(app); }
  });

  it('says to ask again when the app has not answered in time', async () => {
    const out = await askToBringBack({ dir: asks, paths: ['designs/w-a'], cwd: root, waitMs: 300 });
    expect(out.status).toBe('waiting');
    expect(out.message).toMatch(/again/);
  });

  it('refuses an ask with no paths or too many', async () => {
    await expect(askToBringBack({ dir: asks, paths: [], cwd: root, waitMs: 10 })).rejects.toThrow(/path/);
    await expect(askToBringBack({ dir: asks, paths: Array.from({ length: 201 }, (_, i) => `x${i}`), cwd: root, waitMs: 10 })).rejects.toThrow(/200/);
  });
});

describe('a cloud run asking the computer for a file', () => {
  it('is sent the file after it comes back, rather than told it is not there', async () => {
    await offTheMac({ 'designs/w-a/a.png': 'picture a' });
    const { createResourceRequests } = await import('../main/cloud/resources.mts');
    fs.mkdirSync(path.join(root, 'task'), { recursive: true });
    const sent: Buffer[] = [];
    const request = createResourceRequests({
      cwd: path.join(root, 'task'), docs, account: root, homeDir: path.join(root, 'home'), configDir: path.join(root, 'home/.claude'), engine: 'claude',
      runId: 'run-back', state: {}, save: () => {}, stopped: () => false, timeoutMs: 1000,
      upload: async (key: string, body: Buffer) => { sent.push(body); return `https://storage.invalid/${key}`; }, deliver: async () => true,
    });
    const answer = await request({ kind: 'file', scope: 'documents', path: 'designs/w-a/a.png' });
    expect(answer).toMatchObject({ status: 'delivered' });
    expect(sent.map(String)).toEqual(['picture a']);
  });
});

describe('the store\'s tool', () => {
  let built: Array<{ claims: { _stop: () => void } }> = [];
  beforeEach(async () => {
    const home = (await import('../main/store/home.mts')).appHome();
    process.env.STORE_ACCOUNT_ID = 'acct-come-back';
    fs.mkdirSync(path.join(home, 'accounts', 'acct-come-back'), { recursive: true });
  });
  afterEach(() => { for (const b of built) b.claims._stop(); built = []; delete process.env.STORE_ACCOUNT_ID; });
  const names = async (opts: object) => {
    const b = (await import('../mcp/tools.mts')).buildTools({ holder: `t-${Math.random()}`, ownItem: null, ...opts }) as unknown as { tools: { name: string }[]; claims: { _stop: () => void } };
    built.push(b);
    return b.tools.map((t) => t.name);
  };

  it('is offered to an agent on the computer', async () => {
    expect(await names({})).toContain('bring_back_files');
  });

  it('is not offered on a cloud machine, which asks the computer with request_cloud_resource', async () => {
    const there = await names({ requestCloudResource: async () => ({}) });
    expect(there).not.toContain('bring_back_files');
    expect(there).toContain('request_cloud_resource');
  });
});
