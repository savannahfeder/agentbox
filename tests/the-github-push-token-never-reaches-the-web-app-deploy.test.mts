// Weekly security audit, 2026-11-16. A ship runs scripts/ship.mjs with the
// person's GitHub push token in its environment, for git's push alone (the
// pre-push hook drops it before the branch's tests). After the push, the web
// app deploy ran `npx wrangler whoami` and `npm run phone:deploy` in the task
// folder with that environment, so the branch's own build scripts and a
// node_modules/.bin/wrangler a worker planted both read the token. Measured
// with the app's own ship on dummy repos: both printed the dummy token.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { deployAfterShip } from '../scripts/lib/web-app-deploy.mjs';

let tmp = '', root = '', seen = '', server: http.Server;
const saved = { PATH: process.env.PATH, token: process.env.GIT_AGENTBOX_GITHUB_TOKEN };
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
  cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'A', GIT_AUTHOR_EMAIL: 'a@b.c', GIT_COMMITTER_NAME: 'A', GIT_COMMITTER_EMAIL: 'a@b.c' },
});

beforeAll(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-token-')));
  server = http.createServer((_q, r) => { r.end('<html>no build named</html>'); });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const origin = path.join(tmp, 'origin.git');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
  root = path.join(tmp, 'task');
  git(tmp, 'clone', '-q', origin, root);
  fs.mkdirSync(path.join(root, 'cloud'));
  fs.writeFileSync(path.join(root, 'cloud', 'team.config.json'), JSON.stringify({ phoneSite: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` }));
  fs.writeFileSync(path.join(root, 'a.txt'), 'a\n');
  git(root, 'add', 'a.txt'); git(root, 'commit', '-qm', 'one'); git(root, 'push', '-q', 'origin', 'HEAD:main');
  // What the branch controls: the npx and npm the deploy runs, recording what they were given.
  seen = path.join(tmp, 'seen.txt');
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  for (const name of ['npx', 'npm']) {
    // npm leaves what the build would, so the deploy goes on to the upload.
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho "${name} token=[$GIT_AGENTBOX_GITHUB_TOKEN] git=[$(env | grep -c '^GIT_')]" >> "${seen}"\n${name === 'npm' ? "mkdir -p phone-site && echo '<html></html>' > phone-site/index.html\n" : ''}echo "logged in"\n`);
    fs.chmodSync(path.join(bin, name), 0o755);
  }
  process.env.PATH = `${bin}:${saved.PATH}`;
  process.env.GIT_AGENTBOX_GITHUB_TOKEN = 'dummy-token-123';
});

afterAll(() => {
  process.env.PATH = saved.PATH;
  if (saved.token === undefined) delete process.env.GIT_AGENTBOX_GITHUB_TOKEN; else process.env.GIT_AGENTBOX_GITHUB_TOKEN = saved.token;
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('the GitHub push token never reaches the web app deploy', () => {
  it('runs the deploy without the token or any other git variable', async () => {
    // On a Mac the real sandbox stops the stand-in npm writing `seen`, so this
    // runs it with the environment the deploy hands the sandbox, and no more.
    const sandboxed = (cmd: string, args: string[], { cwd, env }: { cwd: string; env: NodeJS.ProcessEnv }) =>
      spawnSync(cmd, args, { cwd, env, stdio: 'ignore' }).status ?? 1;
    const out = await deployAfterShip({ root, say: () => {}, until: Date.now() + 60 * 60_000, sandboxed });
    const lines = fs.readFileSync(seen, 'utf8');
    expect(lines).toMatch(/^npx /m);
    expect(lines).toMatch(/^npm /m);
    expect(lines).not.toContain('dummy-token-123');
    expect(lines).not.toMatch(/git=\[[1-9]/);
    expect(out).toEqual({ deployed: true });
  });
});
