// A WORKER CANNOT OPEN A DEBUGGER INTO THE RUNNING APP.
//
// The installed app shipped with Electron's fuses at their defaults, so its
// main process opened a Node inspector on 127.0.0.1:9229 for anyone who sent
// it SIGUSR1. Workers run as the same user, so one shell command from any
// Claude Code worker could evaluate code inside the app: the unsealed
// connections vault, the team session, and the key that signs approvals,
// with the keychain answering as Agentbox itself (security review
// 2026-11-13: reproduced with Electron 43.8.4, a dummy secret held in a main
// process came back over the inspector's Runtime.evaluate).
//
// The packaged app now turns off the inspector arguments (which also gates
// SIGUSR1) and NODE_OPTIONS. Nothing the app ships uses either. RunAsNode
// stays on: every helper process is the app's own binary run as Node.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

describe('the packaged app', () => {
  it('opens no inspector, by flag or by signal, and reads no NODE_OPTIONS', () => {
    expect(pkg.build.electronFuses).toMatchObject({
      enableNodeCliInspectArguments: false,
      enableNodeOptionsEnvironmentVariable: false,
    });
  });

  it('keeps running its helpers as Node, which they need', () => {
    expect(pkg.build.electronFuses.runAsNode).not.toBe(false);
  });
});

describe('nothing the app ships relies on what is turned off', () => {
  const shipped = ['main', 'shared', 'mcp', 'bin'];
  const files = shipped.flatMap((d) => fs.readdirSync(path.join(root, d), { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(mts|mjs|cjs|js)$/.test(f)).map((f) => path.join(d, f)));

  it('passes no --inspect to a process it starts', () => {
    const using = files.filter((f) => /['"`]--inspect/.test(fs.readFileSync(path.join(root, f), 'utf8')));
    expect(using).toEqual([]);
  });

  it('sets NODE_OPTIONS for nothing it starts', () => {
    const setting = files.filter((f) => /NODE_OPTIONS\s*[:=]/.test(fs.readFileSync(path.join(root, f), 'utf8')));
    expect(setting).toEqual([]);
  });
});
