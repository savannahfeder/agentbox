// On 2026-10-07, the reported setup screen repeatedly printed
// `env: node: No such file or directory` while saying it awaited browser approval.
// Finding an npm Codex wrapper is not enough: Finder's PATH omits its Node.
// The reproduced launch exited 127. These launch real Node-shebang fixtures
// with only /usr/bin:/bin on PATH;
// no login, network request, or model is used.
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEngineSetup } from '../main/engine-setup.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { refreshAgentModels } from '../main/refresh-agent-models.mjs';
import { askSmallModel } from '../main/row-label.mjs';
import { installedAgent } from '../main/agent-updates.mjs';
import { codexLaunchEnv } from '../main/codex-launch-env.mjs';

const dirs = [];
const setups = [];
const servers = [];
afterEach(() => {
  for (const setup of setups.splice(0)) setup.cancel('codex');
  for (const server of servers.splice(0)) server.close('test complete');
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function desktop({ separateNode = false } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-desktop-'));
  dirs.push(home);
  const nodeDir = path.join(home, '.nvm/versions/node/v22.0.0/bin');
  const binDir = separateNode ? path.join(home, '.npm-global/bin') : nodeDir;
  fs.mkdirSync(nodeDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.symlinkSync(process.execPath, path.join(nodeDir, 'node'));
  const bin = path.join(binDir, 'codex');
  fs.writeFileSync(bin, `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
const marker = path.join(process.env.HOME, 'signed-in');
const args = process.argv.slice(2);
if (args[0] === 'login') {
  if (args[1] === 'status') process.exit(fs.existsSync(marker) ? 0 : 1);
  fs.writeFileSync(marker, 'yes');
  process.exit(0);
}
if (args[0] === 'exec') { console.log('Fix the sign in'); process.exit(0); }
if (args[0] === '--version') { console.log('codex-cli 0.0.1'); process.exit(0); }
readline.createInterface({ input: process.stdin }).on('line', line => {
  const msg = JSON.parse(line);
  if (msg.id === undefined) return;
  const result = msg.method === 'model/list'
    ? { data: [{ id: 'test-model', model: 'test-model', displayName: 'Test' }], nextCursor: null }
    : {};
  console.log(JSON.stringify({ id: msg.id, result }));
});
`, { mode: 0o755 });
  // No .mjs suffix on an npm-style executable: its package owns ESM mode.
  fs.writeFileSync(path.join(binDir, 'package.json'), '{"type":"module"}');
  const env = { PATH: '/usr/bin:/bin', HOME: home };
  return { home, bin, nodeDir, env, find: () => ({ found: true, path: bin }) };
}

async function settled(setup) {
  for (let n = 0; n < 200; n++) {
    const state = setup.status('codex');
    if (state.phase === 'ready' || state.phase === 'failed') return state;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return setup.status('codex');
}

describe('Codex opened from the desktop', () => {
  it.each([false, true])('signs in with Node %s stored separately from the wrapper', async separateNode => {
    const m = desktop({ separateNode });
    const setup = createEngineSetup({ find: m.find, env: m.env, poll: 10 });
    setups.push(setup);
    setup.start('codex');
    expect((await settled(setup)).phase).toBe('ready');
    expect(await setup.readiness('codex')).toEqual({ engine: 'codex', found: true, signedIn: true });
    expect(m.env.PATH).toBe('/usr/bin:/bin');
  });

  it('starts the shared agent server with the same Node path', async () => {
    const m = desktop();
    vi.stubEnv('PATH', m.env.PATH);
    vi.stubEnv('HOME', m.home);
    const sup = Object.create(Supervisor.prototype);
    sup.config = { home: m.home, codexBin: m.bin, codexHome: path.join(m.home, '.codex') };
    const { client, handshake } = sup._codexServer();
    servers.push(client);
    await expect(handshake).resolves.toEqual({});
  });

  it('refreshes the available models with the same Node path', async () => {
    const m = desktop();
    vi.stubEnv('PATH', m.env.PATH);
    vi.stubEnv('HOME', m.home);
    await expect(refreshAgentModels('codex', { home: m.home, codexBin: m.bin }, path.join(m.home, '.codex'))).resolves.toBeUndefined();
  });

  it('can name a task through the Node-based Codex wrapper', async () => {
    const m = desktop();
    expect(await askSmallModel('Name this task', text => text.trim(), {
      engine: 'codex', codexBin: m.bin, env: m.env,
    })).toBe('Fix the sign in');
  });

  it('can inspect the installed version through the Node-based wrapper', async () => {
    const m = desktop();
    vi.stubEnv('PATH', m.env.PATH);
    vi.stubEnv('HOME', m.home);
    expect((await installedAgent('codex', { home: m.home, codexBin: m.bin })).version).toBe('0.0.1');
  });

  it('reports a launch failure before asking for browser approval', async () => {
    const onSignIn = vi.fn();
    const spawn = vi.fn((_bin, _args, opts) => {
      opts.onData?.('env: node: No such file or directory\n');
      return { exit: Promise.resolve(127), kill() {} };
    });
    const setup = createEngineSetup({ find: () => ({ found: true, path: '/missing/codex' }), spawn, onSignIn, poll: 1 });
    setups.push(setup);
    setup.start('codex');
    const state = await settled(setup);
    expect(state.phase).toBe('failed');
    expect(state.error).toContain('env: node: No such file or directory');
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(onSignIn).not.toHaveBeenCalled();
    expect(await setup.signedInNow('codex', '/missing/codex')).toBe(false);
  });

  it('does not poll forever after a successful login that left no credentials', async () => {
    const setup = createEngineSetup({
      find: () => ({ found: true, path: '/test/codex' }), poll: 1,
      spawn: (_bin, args) => ({ exit: Promise.resolve(args.includes('status') ? 1 : 0), kill() {} }),
    });
    setups.push(setup);
    setup.start('codex');
    expect((await settled(setup)).phase).toBe('failed');
  });

  it('reports a check that never answers without starting browser sign-in', async () => {
    const kill = vi.fn();
    const onSignIn = vi.fn();
    const spawn = vi.fn(() => ({ exit: new Promise(() => {}), kill }));
    const setup = createEngineSetup({
      find: () => ({ found: true, path: '/test/codex' }), spawn, onSignIn,
      wait: () => Promise.resolve(),
    });
    setups.push(setup);
    setup.start('codex');
    expect((await settled(setup)).error).toContain('did not answer');
    expect(kill).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(onSignIn).not.toHaveBeenCalled();
  });
});

describe('the Node path for Codex', () => {
  const home = '/test/home';
  const bin = `${home}/.npm-global/bin/codex`;
  const source = { HOME: home, PATH: '/usr/bin:/bin', CODEX_HOME: '/chosen/account', LANG: 'en_US.UTF-8' };
  const readdir = dir => dir.endsWith('/node') || dir.endsWith('/node-versions') || dir.endsWith('/nodejs') ? ['v22'] : [];

  it.each([
    '.nvm/versions/node/v22/bin',
    '.local/share/fnm/node-versions/v22/installation/bin',
    'Library/Application Support/fnm/node-versions/v22/installation/bin',
    'n/versions/node/v22/bin',
    '.asdf/installs/nodejs/v22/bin',
    '.volta/bin',
    '.bun/bin',
  ])('finds Node in %s without executing a shell profile', location => {
    const nodeDir = `${home}/${location}`;
    const env = codexLaunchEnv(bin, source, { exists: file => file === `${nodeDir}/node`, readdir });
    expect(env.PATH.split(':')).toEqual([`${home}/.npm-global/bin`, nodeDir, '/usr/bin', '/bin']);
    expect(env.CODEX_HOME).toBe('/chosen/account');
    expect(source.PATH).toBe('/usr/bin:/bin');
  });

  it('prefers Node beside this Codex over a different version on PATH', () => {
    const env = codexLaunchEnv(bin, source, { exists: file => file === '/usr/bin/node' || file === `${home}/.npm-global/bin/node`, readdir });
    expect(env.PATH).toBe(`${home}/.npm-global/bin:/usr/bin:/bin`);
  });

  it('keeps the existing Node ahead of other installations', () => {
    const env = codexLaunchEnv(bin, source, { exists: file => file.endsWith('/node') && !file.startsWith(`${home}/.npm-global`), readdir });
    expect(env.PATH).toBe(`${home}/.npm-global/bin:/usr/bin:/bin`);
  });

  it('does not require Node to launch standalone Codex or invent a Node path', () => {
    const env = codexLaunchEnv('/standalone/codex', source, { exists: () => false, readdir: () => [] });
    expect(env.PATH).toBe('/standalone:/usr/bin:/bin');
    expect(env.LANG).toBe(source.LANG);
  });

  it('leaves an absent Codex environment alone', () => {
    expect(codexLaunchEnv(null, source)).toEqual(source);
  });
});
