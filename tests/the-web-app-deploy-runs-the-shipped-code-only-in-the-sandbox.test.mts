// Daily security review, 2026-11-24. After a ship's push, the web app's deploy
// ran `npm run phone:deploy` in a fresh copy of the shipped commit, outside any
// sandbox and beside the person's Cloudflare sign-in. That commit is the branch
// a worker wrote, minutes after its tests were sandboxed, so its build scripts
// and package.json ran as the person; `npx wrangler` from inside the copy would
// also run a wrangler in its node_modules. Measured by reading the deploy with
// stand-in npm and npx that record where they ran.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { deployAfterShip, personsSettings } from '../scripts/lib/web-app-deploy.mjs';

let tmp = '', root = '', app = '', seen = '', server: http.Server;
const saved = { PATH: process.env.PATH };
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
  cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'A', GIT_AUTHOR_EMAIL: 'a@b.c', GIT_COMMITTER_NAME: 'A', GIT_COMMITTER_EMAIL: 'a@b.c' },
});

beforeAll(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-sandbox-')));
  server = http.createServer((_q, r) => { r.end('<html>no build named</html>'); });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const origin = path.join(tmp, 'origin.git');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
  root = path.join(tmp, 'task');
  git(tmp, 'clone', '-q', origin, root);
  fs.mkdirSync(path.join(root, 'cloud'));
  fs.writeFileSync(path.join(root, 'cloud', 'team.config.json'), JSON.stringify({ phoneSite: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, phonePagesProject: 'planted-by-a-test' }));
  // The app folder, which no branch writes, names the phone site and no project.
  app = path.join(tmp, 'app');
  fs.mkdirSync(path.join(app, 'cloud'), { recursive: true });
  fs.writeFileSync(path.join(app, 'cloud', 'team.config.json'), JSON.stringify({ phoneSite: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` }));
  fs.writeFileSync(path.join(root, 'a.txt'), 'a\n');
  git(root, 'add', 'a.txt'); git(root, 'commit', '-qm', 'one'); git(root, 'push', '-q', 'origin', 'HEAD:main');
  seen = path.join(tmp, 'seen.txt');
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  // npm builds what the build would: phone-site/index.html in the folder it ran in.
  fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\necho "npm $* in $(pwd -P)" >> "${seen}"\nmkdir -p phone-site && echo '<html></html>' > phone-site/index.html\n`);
  fs.writeFileSync(path.join(bin, 'npx'), `#!/bin/sh\necho "npx $* in $(pwd -P)" >> "${seen}"\necho "logged in"\n`);
  for (const name of ['npm', 'npx']) fs.chmodSync(path.join(bin, name), 0o755);
  process.env.PATH = `${bin}:${saved.PATH}`;
});

afterAll(() => {
  process.env.PATH = saved.PATH;
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('the web app deploy after a ship', () => {
  const sandboxed: { cmd: string; args: string[]; cwd: string }[] = [];
  let out: unknown; let lines = '';
  beforeAll(async () => {
    const stand = (cmd: string, args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }) => {
      sandboxed.push({ cmd, args, cwd: fs.realpathSync(opts.cwd) });
      return execFileSync(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: 'ignore' }) ? 0 : 0;
    };
    out = await deployAfterShip({ root, trusted: app, say: () => {}, until: Date.now() + 60 * 60_000, sandboxed: stand });
    lines = fs.readFileSync(seen, 'utf8');
  });

  it('builds the web app in the sandbox, in a copy of the shipped commit', () => {
    const ran = sandboxed.map((s) => [s.cmd, ...s.args].join(' '));
    expect(ran).toEqual(['npm ci --no-audit --no-fund --ignore-scripts', 'npm rebuild', 'npm run phone:build']);
    for (const s of sandboxed) expect(s.cwd.startsWith(root)).toBe(false);
    expect(new Set(sandboxed.map((s) => s.cwd)).size).toBe(1);
    expect(lines.split('\n').filter((l) => l.startsWith('npm ')).length).toBe(3);
    expect(lines).not.toMatch(/phone:deploy/);
  });

  it('uploads with wrangler from a folder that holds none of the shipped code', () => {
    const npx = lines.split('\n').filter((l) => l.startsWith('npx '));
    expect(npx.length).toBeGreaterThan(0);
    for (const l of npx) {
      expect(l).not.toContain(`${sandboxed[0].cwd} `);
      expect(l).not.toContain(root);
    }
    expect(lines).toMatch(/^npx --yes wrangler@4 pages deploy \S+\/phone-site --project-name /m);
  });

  it('names the Pages project from settings no test could write', () => {
    expect(lines).not.toContain('planted-by-a-test');
    expect(lines).toMatch(/--project-name agentbox-phone /);
    expect(out).toEqual({ deployed: true });
  });
});

describe('the settings the deploy goes by', () => {
  const home = () => { const h = fs.mkdtempSync(path.join(tmp, 'home-')); return h; };
  const put = (file: string, value: object) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };

  it('are the app folder\'s when they name the phone site', () => {
    const app = fs.mkdtempSync(path.join(tmp, 'app-'));
    put(path.join(app, 'cloud', 'team.config.json'), { phoneSite: 'https://app.example/' });
    expect(personsSettings(app, home())?.phoneSite).toBe('https://app.example/');
  });

  it('are the home folder\'s when the app folder\'s name no phone site', () => {
    const app = fs.mkdtempSync(path.join(tmp, 'app-'));
    put(path.join(app, 'cloud', 'team.config.json'), { url: 'https://db.example' });
    const h = home();
    put(path.join(h, '.agentbox', 'team.config.json'), { phoneSite: 'https://home.example/' });
    expect(personsSettings(app, h)?.phoneSite).toBe('https://home.example/');
  });

  it('never come from the task folder when the ship names the app folder', async () => {
    const app = fs.mkdtempSync(path.join(tmp, 'app-'));
    fs.writeFileSync(seen, '');
    const r = await deployAfterShip({ root, trusted: app, say: () => {}, until: Date.now() + 60 * 60_000, sandboxed: () => 0 });
    // The task folder names a phone site; the app folder and this home folder may not.
    if (!personsSettings(app)?.phoneSite) {
      expect(r).toMatchObject({ deployed: false });
      expect(fs.readFileSync(seen, 'utf8')).toBe('');
    }
  });
});
