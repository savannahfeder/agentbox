// THE DEV SERVER IS NOT HER AGENTBOX.
//
// She was working in a window an agent had started against a vite dev server, on
// her real store. Vite rebuilds that window whenever the source under it moves,
// and the source under it is the checkout every agent shares. A change to
// App.tsx that adds, removes or moves a hook — which every branch switch does —
// makes React Fast Refresh rebuild App from nothing, `snap` goes back to null,
// and App.tsx draws the boot screen. Measured, six triggers against a real
// window, one guilty: the harness.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hotWindowVerdict, storeHasWork } from '../main/dev-window.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const REAL = { devUrl: 'http://localhost:5199', fixtures: false, forced: false, storeRoot: '/Users/you/Zero', storeHasWork: true };

describe('the verdict on a hot-reloading window', () => {
  it('refuses one on the real store, which is what happened to her', () => {
    const v = hotWindowVerdict(REAL);
    expect(v.allow).toBe(false);
    // The message has to name the store and the way out, or whoever reads it in
    // a terminal cannot tell whether it means them.
    expect(v.message).toMatch(/\/Users\/you\/Zero/);
    expect(v.message).toMatch(/ZERO_FIXTURES=1/);
    expect(v.message).toMatch(/npm start/);
    expect(v.message).toMatch(/ZERO_DEV_ON_REAL_STORE=1/);
    expect(v.message).toMatch(/w-435356146a/);
  });

  it('allows fixtures, because nothing in that window is hers', () => {
    expect(hotWindowVerdict({ ...REAL, fixtures: true }).allow).toBe(true);
  });

  it('allows a throwaway store, which is what the proof scripts run on', () => {
    expect(hotWindowVerdict({ ...REAL, storeHasWork: false }).allow).toBe(true);
  });

  it('allows it when somebody says they meant it', () => {
    expect(hotWindowVerdict({ ...REAL, forced: true }).allow).toBe(true);
  });

  it('has nothing to say when there is no dev server at all', () => {
    expect(hotWindowVerdict({ ...REAL, devUrl: undefined }).allow).toBe(true);
  });
});

describe('whether a store root has anybody work under it', () => {
  it('is true for a store with an account in it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-has-work-'));
    fs.mkdirSync(path.join(dir, 'accounts', '00000000'), { recursive: true });
    expect(storeHasWork(fs, path, dir)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is false for a throwaway home, and does not throw when nothing is there', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-no-work-'));
    expect(storeHasWork(fs, path, dir)).toBe(false);
    expect(storeHasWork(fs, path, path.join(dir, 'nowhere'))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does not count a dotfile as somebody working', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-dot-'));
    fs.mkdirSync(path.join(dir, 'accounts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'accounts', '.DS_Store'), '');
    expect(storeHasWork(fs, path, dir)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('the guard is wired into the only place every dev window passes', () => {
  it('is asked for in main.mjs before the window is loaded', () => {
    const main = read('main/main.mjs');
    expect(main).toMatch(/import \{ hotWindowVerdict, storeHasWork \} from '\.\/dev-window\.mjs'/);
    expect(main).toMatch(/const verdict = hotWindowVerdict\(/);
    expect(main.indexOf('const verdict = hotWindowVerdict(')).toBeLessThan(main.indexOf('pageReady = true'));
  });

  it('still opens a window when it refuses, rather than showing nothing', () => {
    expect(read('main/main.mjs')).toMatch(/if \(fs\.existsSync\(built\)\) await window\.loadFile\(built/);
  });
});

describe('npm run dev says the same thing before it starts anything', () => {
  const refuses = (env) => {
    try {
      execFileSync(process.execPath, [path.join(root, 'scripts', 'dev.mjs')], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ZERO_FIXTURES: '', ZERO_DEV_ON_REAL_STORE: '', ...env },
        timeout: 20_000,
      });
      return null;
    } catch (err) {
      return { status: err.status, stderr: String(err.stderr ?? '') };
    }
  };

  it('refuses, and says the three ways forward', () => {
    const out = refuses({});
    expect(out, 'dev.mjs should have exited rather than started a dev server').not.toBeNull();
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/real store/);
    expect(out.stderr).toMatch(/ZERO_FIXTURES=1 npm run dev/);
    expect(out.stderr).toMatch(/npm start/);
    expect(out.stderr).toMatch(/ZERO_DEV_ON_REAL_STORE=1/);
    expect(out.stderr).toMatch(/w-435356146a/);
  });

  it('does not stand in the way of fixtures', () => {
    const src = read('scripts/dev.mjs');
    expect(src).toMatch(/const onFixtures = !!process\.env\.ZERO_FIXTURES/);
    expect(src).toMatch(/if \(!onFixtures && !forced\)/);
  });
});

describe('the screen she was describing', () => {
  it('is what App draws with no snapshot, which is why a rebuilt App shows it', () => {
    // If this line moves, the diagnosis in main/dev-window.mjs stops being true
    // and starts lying to whoever reads it next.
    expect(read('renderer/src/App.tsx')).toMatch(/if \(!snap\) return <div className="boot">\{NAME\}<\/div>;/);
  });
});

// THE SECOND HALF: A DEV SERVER MUST NOT INHERIT A WINDOW IT DID NOT OPEN.
//
// Found 2026-08-23 while getting her out of the first half. Killing the dev
// server under her window does not navigate it, because vite's client only
// reloads once a ping to the SAME url succeeds. So her window sat intact and
// polling port 5199, and the next `npm run dev` to bind 5199 would have thrown
// her straight back in. A fixed port is what makes that possible.
describe('a dev server never inherits a window it did not open', () => {
  it('picks a port nothing is holding, so no waiting window is answered', async () => {
    const { chooseDevPort } = await import('../main/dev-window.mjs');
    const net = await import('node:net');

    // Stand in for her window's old port: something already bound.
    const squatter = net.createServer();
    await new Promise((r) => squatter.listen(0, '127.0.0.1', r));
    const taken = squatter.address().port;

    const chosen = await chooseDevPort(net);
    expect(chosen).toBeGreaterThan(0);
    expect(chosen).not.toBe(taken);

    // And it must actually be bindable, or strictPort kills the dev run.
    const proof = net.createServer();
    await new Promise((r) => proof.listen(chosen, '127.0.0.1', r));
    await new Promise((r) => proof.close(r));
    await new Promise((r) => squatter.close(r));
  });

  it('leaves no fixed port in the dev script for an old window to be caught by', () => {
    const dev = read('scripts/dev.mjs');
    // 5199 was the port her window was left polling. If it comes back as a
    // literal here, the trap comes back with it.
    expect(dev).not.toMatch(/5199/);
    expect(dev).toMatch(/chooseDevPort/);
  });

  it('tells its own electron the port it actually got', () => {
    const dev = read('scripts/dev.mjs');
    expect(dev).toMatch(/ZERO_DEV_URL: devUrl/);
  });
});
