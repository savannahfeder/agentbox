// A LOCAL CHANNEL KEY AND ITS NONCES STAY IN THE ACCOUNT'S OWN FOLDER.
//
// What was needed. On Windows the app's channels are named pipes, which any
// local account can list, create first or connect to. main/local-channel.mts
// keeps what a stranger must not have (a 32-byte account key, the marker that
// names each server's random pipe, and the nonces clients leave once they have
// connected) in a folder under %LOCALAPPDATA%, which only the account can
// read. These pin that two processes starting at once settle on one key
// (measured with four child processes released at the same instant on one
// folder), that a damaged key is replaced, that a server sees only the nonces
// left for its own pipe and sweeps ones a minute off either way, that the
// folder is refused outside the home folder but found through an 8.3 short
// spelling of it, and that a network path is refused before any file call,
// since resolving one made a real SMB lookup that took 5.5 s. Everything but
// the 8.3 case runs on macOS and Linux.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { channelDir, connectLocal, leaveChallenge, loadKey, nonceFeed, pipeName, serveLocal } from '../main/local-channel.mts';
import { nameSlug } from '../shared/product-name.mjs';
import { stripTypesFlags } from '../main/strip-types.mts';

const MODULE = pathToFileURL(path.resolve(import.meta.dirname, '../main/local-channel.mts')).href;

const dirs = [];
afterEach(() => {
  vi.restoreAllMocks();
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-key-'));
  dirs.push(dir);
  return dir;
};

describe('a pipe name', () => {
  it('is new every time and carries the kind', () => {
    const names = Array.from({ length: 20 }, () => pipeName('runs'));
    expect(new Set(names).size).toBe(20);
    for (const name of names) expect(name).toMatch(new RegExp(`^\\\\\\\\\\.\\\\pipe\\\\${nameSlug}-runs-[0-9a-f]{32}$`));
  });

  it('refuses a kind it cannot place safely in a name', () => {
    for (const kind of ['../runs', 'Runs', '', 'a b', 'x'.repeat(25), undefined]) expect(() => pipeName(kind)).toThrow(/kind/);
    expect(pipeName('run-host-2')).toContain(`${nameSlug}-run-host-2-`);
  });
});

describe('the channel key', () => {
  it('is 32 bytes, made once and read back after that', () => {
    const dir = tempDir();
    const first = loadKey(dir);
    expect(first.length).toBe(32);
    expect(loadKey(dir).equals(first)).toBe(true);
    expect(fs.readdirSync(dir)).toEqual(['key']);
  });

  it('is the same key for four processes that start at once', async () => {
    const dir = path.join(tempDir(), 'channels');
    // Each child spins until the same moment, so the four calls overlap.
    const script = `import { loadKey } from ${JSON.stringify(MODULE)};
      const at = Number(process.argv[2]); while (Date.now() < at) {}
      process.stdout.write(loadKey(process.argv[1]).toString('hex'));`;
    const at = String(Date.now() + 2000);
    const run = () => new Promise((resolve, reject) => {
      execFile(process.execPath, [...stripTypesFlags(), '--input-type=module', '-e', script, dir, at], { timeout: 20_000 }, (err, out) => (err ? reject(err) : resolve(out)));
    });
    const keys = await Promise.all([run(), run(), run(), run()]);
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(keys).size).toBe(1);
    expect(fs.readFileSync(path.join(dir, 'key')).toString('hex')).toBe(keys[0]);
    expect(fs.readdirSync(dir)).toEqual(['key']);
  });

  it('is replaced, and the replacement logged, when the file is not 32 bytes', () => {
    for (const bad of [Buffer.alloc(0), Buffer.from('short'), crypto.randomBytes(33)]) {
      const dir = tempDir();
      fs.writeFileSync(path.join(dir, 'key'), bad);
      const said = [];
      const key = loadKey(dir, { log: (line) => said.push(line) });
      expect(key.length).toBe(32);
      expect(fs.readFileSync(path.join(dir, 'key')).equals(key)).toBe(true);
      expect(said.join('\n')).toMatch(new RegExp(`was ${bad.length} bytes`));
      expect(fs.readdirSync(dir)).toEqual(['key']);
    }
  });

  it('is not written into the environment', () => {
    const key = loadKey(tempDir()).toString('hex');
    expect(Object.values(process.env).some((v) => String(v).includes(key))).toBe(false);
  });
});

describe('the nonces clients leave once connected', () => {
  const NAME = pipeName('runs');
  const OTHER = pipeName('runs');

  // The next batch the feed hands one pipe's handshake, or [] after 500 ms.
  const nextBatch = (feed, name) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); resolve([]); }, 500);
    const stop = feed.forPipe(name).watch((list) => { clearTimeout(timer); stop(); resolve(list); }, (err) => { clearTimeout(timer); reject(err); });
  });

  it('are empty files whose names carry the time, the pipe and the nonce', () => {
    const dir = tempDir();
    const mine = leaveChallenge(dir, NAME);
    const [entry] = fs.readdirSync(path.join(dir, 'challenges'));
    expect(entry).toMatch(new RegExp(`^\\d+-[0-9a-f]{16}-${mine.nonce.toString('hex')}$`));
    expect(fs.statSync(path.join(dir, 'challenges', entry)).size).toBe(0);
    mine.close();
    expect(fs.readdirSync(path.join(dir, 'challenges'))).toEqual([]);
  });

  it('reach only the server of the pipe they were left for', async () => {
    const dir = tempDir();
    const mine = leaveChallenge(dir, NAME);
    leaveChallenge(dir, OTHER);
    const got = await nextBatch(nonceFeed(dir), NAME);
    expect(got.map((n) => n.toString('hex'))).toEqual([mine.nonce.toString('hex')]);
  });

  it('a minute or more off the clock either way are swept and never handed on', async () => {
    const dir = tempDir();
    const now = Date.now();
    leaveChallenge(dir, NAME, now - 61_000);
    leaveChallenge(dir, NAME, now + 61_000);
    const fresh = leaveChallenge(dir, NAME, now - 30_000);
    const got = await nextBatch(nonceFeed(dir), NAME);
    expect(got.map((n) => n.toString('hex'))).toEqual([fresh.nonce.toString('hex')]);
    await new Promise((r) => setTimeout(r, 100));
    expect(fs.readdirSync(path.join(dir, 'challenges'))).toHaveLength(1);
  });

  it('are none, without an error, before any client has left one', async () => {
    expect(await nextBatch(nonceFeed(tempDir()), NAME)).toEqual([]);
  });

  it('report a folder that cannot be read as an error to the handshake', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'challenges'), 'not a folder');
    await expect(nextBatch(nonceFeed(dir), NAME)).rejects.toThrow(/ENOTDIR|not a directory/i);
  });
});

describe('the folder the Windows key lives in', () => {
  const home = 'C:\\Users\\pat';

  it('is the app folder under %LOCALAPPDATA%', () => {
    expect(channelDir({ platform: 'win32', home, env: { LOCALAPPDATA: 'C:\\Users\\pat\\AppData\\Local' } }))
      .toEqual({ dir: `C:\\Users\\pat\\AppData\\Local\\${nameSlug}\\channels` });
  });

  it('falls back to AppData\\Local in the home folder when %LOCALAPPDATA% is unset, blank or not a drive path', () => {
    for (const env of [{}, { LOCALAPPDATA: '  ' }, { LOCALAPPDATA: 'AppData\\Local' }, { LOCALAPPDATA: '\\Users\\pat' }]) {
      expect(channelDir({ platform: 'win32', home, env })).toEqual({ dir: `C:\\Users\\pat\\AppData\\Local\\${nameSlug}\\channels` });
    }
  });

  it('accepts a home folder spelled with different capitals', () => {
    expect(channelDir({ platform: 'win32', home, env: { LOCALAPPDATA: 'c:\\users\\PAT\\AppData\\Local' } }).dir)
      .toBe(`c:\\users\\PAT\\AppData\\Local\\${nameSlug}\\channels`);
  });

  it('is refused outside the home folder, with the reason', () => {
    for (const LOCALAPPDATA of ['D:\\Shared', 'C:\\Users\\Public\\AppData\\Local', 'C:\\Users\\pat2\\AppData\\Local', 'C:\\Users\\pat\\..\\eve\\AppData']) {
      const got = channelDir({ platform: 'win32', home, env: { LOCALAPPDATA } });
      expect(got.dir, LOCALAPPDATA).toBeNull();
      expect(got.reason).toMatch(/not inside the home folder/);
    }
  });

  it('is refused on a network or device path without a single file call', () => {
    const calls = [vi.spyOn(fs.realpathSync, 'native')];
    for (const fn of ['realpathSync', 'statSync', 'lstatSync', 'existsSync', 'readdirSync', 'accessSync', 'openSync', 'readFileSync', 'mkdirSync']) {
      calls.push(vi.spyOn(fs, fn));
    }
    const unc = ['\\\\server\\share\\pat', '//server/share/pat', '\\/server\\share', '/\\server\\share', '\\\\?\\C:\\Users\\pat\\AppData\\Local', '\\\\.\\C:\\Users\\pat'];
    for (const LOCALAPPDATA of unc) {
      const got = channelDir({ platform: 'win32', home, env: { LOCALAPPDATA } });
      expect(got.dir, LOCALAPPDATA).toBeNull();
      expect(got.reason).toMatch(/not on a local drive/);
    }
    for (const bad of unc) expect(channelDir({ platform: 'win32', home: bad, env: {} }).reason).toMatch(/not a path on a local drive/);
    for (const spy of calls) expect(spy).not.toHaveBeenCalled();
  });

  it('is refused when there is no usable home folder', () => {
    for (const bad of ['', 'pat', null, 'C:pat']) expect(channelDir({ platform: 'win32', home: bad, env: {} }).dir).toBeNull();
  });

  it('is not used on macOS or Linux, where the channel is a unix socket path', () => {
    for (const platform of ['darwin', 'linux']) expect(channelDir({ platform, home: '/home/pat', env: {} }).dir).toBeNull();
  });

  const tmp = os.tmpdir();
  const shortSpelling = process.platform === 'win32' && tmp.includes('~') && fs.realpathSync.native(tmp) !== tmp;
  it.runIf(shortSpelling)('is found when %LOCALAPPDATA% or the home folder is spelled the 8.3 way', () => {
    const short = tempDir();
    const long = fs.realpathSync.native(short);
    const longHome = fs.realpathSync.native(tmp);
    expect(channelDir({ platform: 'win32', home: longHome, env: { LOCALAPPDATA: short } }).dir).toBe(path.win32.join(long, nameSlug, 'channels'));
    expect(channelDir({ platform: 'win32', home: tmp, env: { LOCALAPPDATA: long } }).dir).toBe(path.win32.join(long, nameSlug, 'channels'));
  });
});

describe('a Windows channel with no folder', () => {
  it('is a clear error for the server, the client and the key', async () => {
    const server = net.createServer();
    await expect(serveLocal(server, { kind: 'runs', platform: 'win32', dir: null })).rejects.toThrow(/channel needs its folder, which channelDir\(\) gives/);
    expect(server.listening).toBe(false);
    await expect(connectLocal({ kind: 'runs', platform: 'win32' })).rejects.toThrow(/channel needs its folder/);
    expect(() => loadKey(undefined)).toThrow(/channel needs its folder/);
  });
});
