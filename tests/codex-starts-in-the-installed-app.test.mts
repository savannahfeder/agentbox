// CODEX STARTS IN THE INSTALLED APP, NOT ONLY IN A COPY RUN FROM SOURCE.
//
// A tester with only Codex had every thread sit at "Queued" on 0.1.9. Run from
// Terminal, the app printed `zero: could not start w-…: spawn ENOTDIR` every
// fifteen seconds. The Codex app-server was spawned with `cwd: this.appDir`,
// and in a packaged build appDir is `Contents/Resources/app.asar`, which is a
// FILE. Node refuses a cwd that is not a directory by throwing ENOTDIR
// synchronously, so no Codex worker could ever start. Measured against the
// installed /Applications/Agentbox.app: spawning /bin/echo with that cwd threw
// `spawn ENOTDIR`; the same spawn from a real folder ran. A copy run from
// source has a real folder there, which is why nobody running from source saw it.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const spawns = vi.hoisted(() => []);
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  const { EventEmitter: Emitter } = await import('node:events');
  return {
    ...actual,
    spawn: (bin, args, options) => {
      // What Node does with a cwd inside app.asar: Electron lets the app READ
      // files in the archive, but a spawn's cwd goes to the OS, which sees a file.
      if (options?.cwd && String(options.cwd).split(sep).includes('app.asar')) {
        throw Object.assign(new Error('spawn ENOTDIR'), { code: 'ENOTDIR' });
      }
      spawns.push({ bin, args, options });
      const child = new Emitter();
      child.stdout = new Emitter();
      child.stderr = new Emitter();
      child.stdin = Object.assign(new Emitter(), { write: (_c, cb) => { cb?.(null); return true; }, end() {} });
      child.kill = () => true;
      return child;
    },
  };
});

const { Supervisor } = await import('../main/supervisor.mts');

const CODEX_BIN = '/nonexistent/codex/codex';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [];
// An installed build's app folder: `Resources/app.asar`, holding what the app
// ships. A link to this checkout stands in for the archive's contents.
function installedAppDir() {
  const asar = join(temp('Resources-'), 'app.asar');
  symlinkSync(REPO, asar);
  return asar;
}
const temp = (name) => { const d = mkdtempSync(join(tmpdir(), name)); dirs.push(d); return d; };

function build(appDir) {
  const store = temp('codex-installed-store-');
  const home = temp('codex-installed-home-');
  const product = { slug: 'shop', name: 'Shop', dir: store, repoPath: null };
  return new Supervisor(
    {
      home, storeRoot: store, claudeBin: '/nonexistent/claude', claudeFound: false,
      codexBin: CODEX_BIN, codexHome: join(home, '.codex'), maxConcurrentSessions: 3,
    },
    {
      listItems: () => [], listProducts: () => [product], getProduct: () => product,
      isDue: () => true, settleAnswer() {}, recordSessionResult() {}, listRepeats: () => [],
    },
    appDir,
  );
}

const row = { id: 'w-task', product: 'shop', kind: 'directive', status: 'open', title: 'Review the repo',
  body: '', labels: ['founder'], priority: 5, createdAt: 1, updatedAt: 1, claim: null, claimExpired: false };

const appServers = () => spawns.filter((s) => s.bin === CODEX_BIN && s.args[0] === 'app-server');

beforeEach(() => { spawns.length = 0; });
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

describe('the Codex app-server', () => {
  it('starts when the app folder is a packed archive, as in an installed build', () => {
    const sup = build(installedAppDir());
    expect(() => sup.spawnWorker(row)).not.toThrow();
    expect(appServers()).toHaveLength(1);
    expect(sup.sessions.has('w-task')).toBe(true);
  });

  it('starts in a real folder, never inside the app', () => {
    const sup = build(installedAppDir());
    sup.spawnWorker(row);
    const cwd = appServers()[0].options.cwd;
    expect(statSync(cwd).isDirectory()).toBe(true);
    expect(cwd.includes('app.asar')).toBe(false);
  });

  it('still starts from a copy run from source', () => {
    const sup = build(REPO);
    sup.spawnWorker(row);
    expect(appServers()).toHaveLength(1);
    expect(statSync(appServers()[0].options.cwd).isDirectory()).toBe(true);
  });
});
