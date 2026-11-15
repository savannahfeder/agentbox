// THE MEMORY LOG SAYS WHAT A NODE PROGRAM IS RUNNING, AND WHAT INSIDE THE APP HOLDS ITS SHARE.
//
// 2026-11-11, a 16 GB Mac, 65 critical minutes in a day. From 6:09 to 6:50am ET
// the two biggest programs outside every task were "node" at 4.4 GB each, and the
// app's own processes averaged 4.2 GB across the critical minutes, written as one
// number. Agents had run tests with the task tag stripped from the environment, so
// neither could be tied to a task, and the log could not say whether they were
// typechecks, test runs or testers. A program run by an interpreter is now named
// with its script (never its arguments), and the app's line names its biggest three.
import { describe, expect, it } from 'vitest';
import { summarizeMemory, programName } from '../main/memory-log.mts';

const proc = (pid, ppid, mb, exe, cmd, extra = {}) => ({ pid, ppid, mb, exe, cmd, item: null, product: null, ...extra });
const NODE = '/u/.nvm/versions/node/v22.23.4/bin/node';
const ELECTRON = '/u/dev/agentbox/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron';

describe('a program run by an interpreter is named with its script', () => {
  it('a typecheck reads as node tsc', () => {
    expect(programName({ exe: NODE, cmd: 'node node_modules/typescript/bin/tsc --noEmit -p renderer/tsconfig.json' })).toBe('node tsc');
  });

  it('a script given by its full path reads by its file name', () => {
    expect(programName({ exe: NODE, cmd: `${NODE} /u/dev/agentbox/scripts/test-what-changed.mjs main/a.mts` })).toBe('node test-what-changed.mjs');
  });

  it('flags before the script are skipped', () => {
    expect(programName({ exe: NODE, cmd: 'node --max-old-space-size=4096 --inspect build.mjs' })).toBe('node build.mjs');
  });

  it('a program that renamed itself keeps the name it gave', () => {
    expect(programName({ exe: NODE, cmd: 'node (vitest 1)' })).toBe('node (vitest 1)');
    expect(programName({ exe: NODE, cmd: 'npm exec vitest related --run main/a.mts' })).toBe('npm exec vitest');
  });

  it("the app's own hosts read apart", () => {
    expect(programName({ exe: ELECTRON, cmd: `${ELECTRON} /u/dev/agentbox/main/run-host.mts /var/folders/x/agentbox-runs.sock` })).toBe('Electron run-host.mts');
    expect(programName({ exe: '/usr/bin/python3', cmd: '/usr/bin/python3 -I /tmp/watch.py --every 60' })).toBe('python3 watch.py');
  });

  it('never carries an argument after the script', () => {
    const name = programName({ exe: NODE, cmd: 'node server.js --token=sk-secret-123 secret-word' });
    expect(name).toBe('node server.js');
    expect(programName({ exe: NODE, cmd: 'npm exec --token=sk-secret-123 x' })).not.toContain('secret');
  });

  it('an interpreter with nothing to run is just its name', () => {
    expect(programName({ exe: NODE, cmd: 'node' })).toBe('node');
    expect(programName({ exe: NODE, cmd: 'node --inspect' })).toBe('node');
    expect(programName({ exe: NODE, cmd: '' })).toBe('node');
  });

  it('a program that is not an interpreter keeps its own name, whatever its arguments', () => {
    expect(programName({ exe: '/Applications/Docker.app/Contents/MacOS/com.docker.backend', cmd: '/Applications/Docker.app/Contents/MacOS/com.docker.backend --x run.js' })).toBe('com.docker.backend');
    expect(programName({ exe: '/u/.local/bin/claude', cmd: 'claude -p do the thing' })).toBe('claude');
    expect(programName({ exe: `${ELECTRON} Helper (Renderer)`, cmd: 'Electron Helper (Renderer) --type=renderer' })).toBe('Electron Helper (Renderer)');
  });
});

describe('one minute on the morning it happened', () => {
  const procs = [
    proc(1, 0, 10, '/sbin/launchd', 'launchd'),
    proc(100, 1, 400, ELECTRON, `${ELECTRON} .`),
    proc(101, 100, 1900, ELECTRON, `${ELECTRON} /u/dev/agentbox/main/run-host.mts /var/x.sock`),
    proc(102, 100, 300, `${ELECTRON} Helper (Renderer)`, 'Electron Helper (Renderer) --type=renderer'),
    proc(103, 100, 50, '/bin/zsh', '/bin/zsh -l'),
    proc(104, 100, 40, '/usr/bin/git', 'git status'),
    // Orphaned when an agent stopped their parent, and run with the task tag removed.
    proc(500, 1, 4400, NODE, 'node node_modules/typescript/bin/tsc --noEmit -p renderer/tsconfig.json'),
    proc(501, 1, 4300, NODE, 'node (vitest 1)'),
    proc(600, 1, 3200, '/Library/Backblaze.bzpkg/bztransmit', '/Library/Backblaze.bzpkg/bztransmit -x'),
  ];
  const line = summarizeMemory(procs, { appPid: 100, at: Date.UTC(2026, 10, 11, 11, 36) });

  it('names the unowned node programs by what they run', () => {
    expect(line.others.slice(0, 3)).toEqual([
      { name: 'node tsc', mb: 4400 },
      { name: 'node (vitest 1)', mb: 4300 },
      { name: 'bztransmit', mb: 3200 },
    ]);
  });

  it("names the app's three biggest programs beside its total", () => {
    expect(line.app).toEqual({
      mb: 2690,
      procs: 5,
      top: [{ name: 'Electron run-host.mts', mb: 1900 }, { name: 'Electron .', mb: 400 }, { name: 'Electron Helper (Renderer)', mb: 300 }],
    });
  });
});
