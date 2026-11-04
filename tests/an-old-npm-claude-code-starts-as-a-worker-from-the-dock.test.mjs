// AN OLD NPM CLAUDE CODE STARTS AS A WORKER WHEN AGENTBOX IS OPENED FROM THE DOCK.
//
// Found 2026-10-11 by the pre-deploy check's fake machines
// (.claude/skills/verify-agentbox, shape `claude-old-npm-under-nvm-lazy`).
// Claude Code installed with `npm i -g` before the package shipped a native
// binary is `#!/usr/bin/env node`. With nvm lazy-loaded, no shell profile puts
// node on PATH, and a Dock launch starts with launchd's four folders, so the
// app found Claude Code and every worker died at once:
// `env: node: No such file or directory`. Codex in the same setup worked,
// because main/codex-launch-env.mts adds the node beside it; Claude workers
// got the environment passed straight through.
//
// The fix is deliberately narrower than Codex's: a worker's PATH is the PATH
// its agent's commands run under, so it is touched only when the binary is a
// node script AND no node is on it already, and the node is added at the END.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { claudeLaunchEnv } from '../main/claude-launch-env.mts';
import { claudeHarness } from '../main/harnesses/claude.mts';

const DOCK = '/usr/bin:/bin:/usr/sbin:/sbin';
let root, home;
const at = (...p) => path.join(home, ...p);
function put(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, { mode: 0o755 }); }
function link(to, from) { fs.mkdirSync(path.dirname(from), { recursive: true }); fs.symlinkSync(to, from); }

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'old-npm-claude-'));
  home = path.join(root, 'home');
  // An old npm Claude Code under nvm, linked the way npm links it.
  put(at('.nvm/versions/node/v20.11.1/lib/node_modules/@anthropic-ai/claude-code/cli.js'), '#!/usr/bin/env node\nconsole.log(1)\n');
  link(at('.nvm/versions/node/v20.11.1/lib/node_modules/@anthropic-ai/claude-code/cli.js'), at('.nvm/versions/node/v20.11.1/bin/claude'));
  put(at('.nvm/versions/node/v20.11.1/bin/node'), '#!/bin/sh\n');
  // A native Claude Code, as the installer leaves it.
  put(at('.local/share/claude/versions/2.1.999'), 'Ïúíþbinary');
  link(at('.local/share/claude/versions/2.1.999'), at('.local/bin/claude'));
  // A folder with a node in it, standing in for one already on PATH.
  put(path.join(root, 'usr-local-bin', 'node'), '#!/bin/sh\n');
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the environment a Claude worker starts with', () => {
  it('an npm Claude Code that is a node script gets the node beside it on PATH', () => {
    const env = claudeLaunchEnv(at('.nvm/versions/node/v20.11.1/bin/claude'), { HOME: home, PATH: DOCK }, { home });
    const dirs = env.PATH.split(':');
    expect(dirs).toContain(at('.nvm/versions/node/v20.11.1/bin'));
    // Added after what was there, so it never shadows the person's own tools.
    expect(dirs.slice(0, 4).join(':')).toBe(DOCK);
  });

  it('a native Claude Code leaves the environment exactly as it was', () => {
    const source = { HOME: home, PATH: DOCK, OTHER: 'x' };
    expect(claudeLaunchEnv(at('.local/bin/claude'), source, { home })).toEqual(source);
  });

  it('a node script with node already on PATH leaves PATH alone', () => {
    const PATH = `${path.join(root, 'usr-local-bin')}:${DOCK}`;
    expect(claudeLaunchEnv(at('.nvm/versions/node/v20.11.1/bin/claude'), { HOME: home, PATH }, { home }).PATH).toBe(PATH);
  });

  it('a binary that is missing or unset changes nothing', () => {
    const source = { HOME: home, PATH: DOCK };
    expect(claudeLaunchEnv(null, source, { home })).toEqual(source);
    expect(claudeLaunchEnv(at('nope/claude'), source, { home })).toEqual(source);
  });

  it('is the launch environment the Claude harness reports', () => {
    const env = claudeHarness.launchEnv(at('.nvm/versions/node/v20.11.1/bin/claude'), { HOME: home, PATH: DOCK }, { home });
    expect(env.PATH.split(':')).toContain(at('.nvm/versions/node/v20.11.1/bin'));
  });
});
