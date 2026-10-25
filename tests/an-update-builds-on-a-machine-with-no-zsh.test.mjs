// AN UPDATE BUILDS ON A MACHINE WITH NO ZSH (w-35354ac3b2, 2026-10-25).
//
// On a Debian box with no /bin/zsh, "Restart to update" came back in about two
// seconds with "The new code would not build: error: spawn /bin/zsh ENOENT",
// and the app stayed on the old code however often it was pressed. The update
// asks a login shell for npm whenever it was not started by npm itself, and
// that shell was `env.SHELL || '/bin/zsh'`: a Linux launcher start has no
// SHELL, so every such box got a path to a file that is not there.
//
// Measured before the change, with a stand-in for what is on disk: a Linux box
// carrying only /bin/bash and /bin/sh still asked for /bin/zsh. The real spawn
// at the foot of this file is the two seconds the tester saw.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultNpm, npmCommand } from '../main/source-updater.mjs';

const onlyThese = (...have) => (file) => have.includes(file);

describe('which npm an update runs', () => {
  it('uses the node and npm that started the app, when it was started by npm', () => {
    const node = process.execPath;
    const cli = path.join(os.tmpdir(), `npm-cli-${process.pid}.js`);
    fs.writeFileSync(cli, '');
    try {
      expect(npmCommand(['run', 'build'], { env: { npm_node_execpath: node, npm_execpath: cli } }))
        .toEqual([node, [cli, 'run', 'build']]);
    } finally {
      fs.rmSync(cli, { force: true });
    }
  });

  it('asks a shell that is on the machine when nothing says which shell they use', () => {
    const [bin, args] = npmCommand(['run', 'build'], { env: {}, exists: onlyThese('/bin/bash', '/bin/sh') });
    expect(bin).toBe('/bin/bash');
    expect(args).toEqual(['-lic', 'npm run build']);
  });

  it('skips a SHELL that is not on the machine', () => {
    const [bin] = npmCommand(['install'], { env: { SHELL: '/bin/zsh' }, exists: onlyThese('/bin/bash', '/bin/sh') });
    expect(bin).toBe('/bin/bash');
  });

  it('still asks zsh on a Mac, which is where zsh is', () => {
    expect(npmCommand(['run', 'build'], { env: { SHELL: '/bin/zsh' }, exists: onlyThese('/bin/zsh', '/bin/bash', '/bin/sh') }))
      .toEqual(['/bin/zsh', ['-lic', 'npm run build']]);
  });

  it('asks their own shell when it is the one they have', () => {
    const [bin] = npmCommand(['run', 'build'], { env: { SHELL: '/usr/bin/fish' }, exists: onlyThese('/usr/bin/fish', '/bin/sh') });
    expect(bin).toBe('/usr/bin/fish');
  });

  it('runs npm itself when there is no shell at all', () => {
    expect(npmCommand(['run', 'build'], { env: {}, exists: () => false }))
      .toEqual(['npm', ['run', 'build']]);
  });
});

describe('the build an update really runs', () => {
  it('runs through the shell this machine has, with no SHELL set and no zsh asked for', async () => {
    const out = await defaultNpm(process.cwd(), {})(['--version']);
    expect(out.out).not.toMatch(/ENOENT/);
  });

  it('reports what the command said, not how it was spawned', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-npm-'));
    const shell = path.join(dir, 'shell');
    fs.writeFileSync(shell, '#!/bin/sh\necho "ran: $2"\n', { mode: 0o755 });
    try {
      const out = await defaultNpm(dir, { SHELL: shell })(['run', 'build']);
      expect(out.code).toBe(0);
      expect(out.out).toContain('ran: npm run build');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
