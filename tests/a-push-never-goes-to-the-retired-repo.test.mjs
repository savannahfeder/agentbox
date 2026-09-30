// A PUSH NEVER GOES TO THE REPOSITORY THIS PROJECT RETIRED.
//
// The project moved to github.com/savannahfeder/agentbox on 2026-09-29 and the
// old private repository was frozen as it was. The same day, a checkout whose
// `origin` still pointed at the old one pushed a commit there: the suite ran,
// went green, and the push landed (0cf149dd..ccf3cc5c). Nothing objected,
// because the only destination check in the hook is the privacy check, and that
// examines pushes to the public repository and waves every other one through on
// purpose, so that a contributor's own fork is not refused.
//
// So the hook now refuses the retired repository by name, before anything
// else runs, in every spelling git accepts. Forks, the public repository and a
// local folder are left alone, which is what keeps the rule narrow.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { retiredDestination } from '../scripts/push-destination.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(root, 'scripts/hooks/pre-push');
const GUARD = path.join(root, 'scripts/push-destination.mjs');

describe('the retired repository', () => {
  it('is recognised in every spelling a remote can have', () => {
    for (const url of [
      'https://github.com/Astral-Agent/zero.git',
      'https://github.com/Astral-Agent/zero',
      'https://github.com/astral-agent/ZERO.git',
      'https://github.com/Astral-Agent/zero/',
      'git@github.com:Astral-Agent/zero.git',
      'ssh://git@github.com/Astral-Agent/zero.git',
      'https://someone@github.com/Astral-Agent/zero.git',
    ]) expect(retiredDestination(url), url).toBe(true);
  });

  it('does not catch a repository whose name merely starts the same way', () => {
    expect(retiredDestination('https://github.com/Astral-Agent/zero-docs.git')).toBe(false);
    expect(retiredDestination('https://github.com/Astral-Agent/zeroth')).toBe(false);
    expect(retiredDestination('https://github.com/not-Astral-Agent/zero')).toBe(false);
  });

  it('leaves the public repository, a fork and a local folder alone', () => {
    expect(retiredDestination('https://github.com/savannahfeder/agentbox.git')).toBe(false);
    expect(retiredDestination('git@github.com:someone/agentbox.git')).toBe(false);
    expect(retiredDestination('/tmp/bare-repo.git')).toBe(false);
    expect(retiredDestination('')).toBe(false);
  });
});

describe('the push itself', () => {
  const run = (file, url) => spawnSync('sh', [file, 'origin', url], {
    cwd: root, input: '', encoding: 'utf8', env: { ...process.env, PATH: process.env.PATH },
  });

  it('is refused by the guard, with the remote to fix named', () => {
    const r = spawnSync(process.execPath, [GUARD, 'origin', 'https://github.com/Astral-Agent/zero.git'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('PUSH REFUSED');
    expect(r.stderr).toContain('git remote set-url origin https://github.com/savannahfeder/agentbox.git');
  });

  it('is let through by the guard when it goes to the public repository', () => {
    const r = spawnSync(process.execPath, [GUARD, 'origin', 'https://github.com/savannahfeder/agentbox.git'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });

  it('is refused by the hook before any test runs', () => {
    // Empty stdin would otherwise exit 0 as "nothing to test", so a 1 here can
    // only have come from the guard, which runs first.
    const r = run(HOOK, 'https://github.com/Astral-Agent/zero.git');
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).toContain('PUSH REFUSED');
    expect(r.stderr + r.stdout).not.toContain('running the whole suite');
  });

  it('is not refused by the hook when it goes anywhere else', () => {
    const r = run(HOOK, 'https://github.com/savannahfeder/agentbox.git');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('nothing to test');
  });
});
