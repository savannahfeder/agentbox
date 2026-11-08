// A TERMINAL THAT STOPS READING DOES NOT FREEZE THE APP.
//
// What broke (w-8918e86ce0, 2026-11-07): the app opened from the Desktop
// launcher writes its log lines to that Terminal window, and Node waits for a
// terminal to take each write. When Terminal fell behind, the app's main
// process stopped dead inside console.log: the freeze recorder caught 20 stalls
// of 12 to 56 seconds in one evening, 68 s on 11-02, 179 in a week. Measured
// with a terminal nobody reads: a program writing log lines ran its timer 0
// times in 3 seconds; with the terminal's writes made non-blocking, 29 of 30.
//
// So the main process lets its terminal fall behind, and past a cap drops log
// lines rather than holding them in memory without end.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { letTheTerminalFallBehind, DROP_PAST_BYTES } from '../main/terminal-output.mts';

const ROOT = path.resolve(import.meta.dirname, '..');

// A program that logs constantly and counts timer ticks, run on a terminal
// whose reader never reads, for three seconds from when it has started: on a
// slow runner Node's own startup took enough of a three-second window from the
// first to leave it under 20 ticks.
function ticksOnAStuckTerminal(fix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stuck-terminal-'));
  const out = path.join(dir, 'ticks');
  const started = path.join(dir, 'started');
  const child = path.join(dir, 'child.mts');
  fs.writeFileSync(child, `
    import fs from 'node:fs';
    import { letTheTerminalFallBehind } from ${JSON.stringify(path.join(ROOT, 'main/terminal-output.mts'))};
    if (${fix}) letTheTerminalFallBehind(process.stdout);
    let ticks = 0;
    setInterval(() => fs.writeFileSync(${JSON.stringify(out)}, String(++ticks)), 100);
    fs.writeFileSync(${JSON.stringify(started)}, '');
    const line = 'x'.repeat(200);
    const spam = () => { for (let k = 0; k < 200; k++) console.log(line); setTimeout(spam, 10); };
    spam();
  `);
  const py = `
import os, pty, sys, time, signal
pid, fd = pty.fork()
if pid == 0:
    os.execv(sys.argv[1], [sys.argv[1], '--experimental-strip-types', '--disable-warning=ExperimentalWarning', sys.argv[2]])
deadline = time.time() + 15
while not os.path.exists(sys.argv[3]) and time.time() < deadline:
    time.sleep(0.02)
time.sleep(3)
os.kill(pid, signal.SIGKILL)
os.waitpid(pid, 0)
`;
  spawnSync('python3', ['-I', '-c', py, process.execPath, child, started], { timeout: 25_000 });
  const ticks = fs.existsSync(out) ? Number(fs.readFileSync(out, 'utf8')) : 0;
  fs.rmSync(dir, { recursive: true, force: true });
  return ticks;
}

const hasPty = process.platform !== 'win32' && spawnSync('python3', ['-c', 'import pty']).status === 0;

describe.skipIf(!hasPty)('on a real terminal that stops reading', () => {
  it('the app keeps running', () => {
    expect(ticksOnAStuckTerminal(true)).toBeGreaterThan(20);
  }, 30_000);

  it('without it, the program froze, which is what this guards', () => {
    expect(ticksOnAStuckTerminal(false)).toBeLessThan(5);
  }, 30_000);
});

describe('what it does to a stream', () => {
  const fake = ({ isTTY = true, writableLength = 0 } = {}) => {
    const written = [];
    let blocking = true;
    return {
      isTTY, writableLength, written,
      get blocking() { return blocking; },
      _handle: { setBlocking: (b) => { blocking = b; } },
      write(chunk, ...rest) { written.push(chunk); const cb = rest.find((r) => typeof r === 'function'); cb?.(); return true; },
    };
  };

  it('makes a terminal non-blocking and still writes to it', () => {
    const s = fake();
    expect(letTheTerminalFallBehind(s)).toBe(true);
    expect(s.blocking).toBe(false);
    s.write('hello\n');
    expect(s.written).toEqual(['hello\n']);
  });

  it('drops a line once more than the cap is waiting, and says it was handled', async () => {
    const s = fake({ writableLength: DROP_PAST_BYTES + 1 });
    letTheTerminalFallBehind(s);
    let called = false;
    expect(s.write('lost\n', () => { called = true; })).toBe(true);
    expect(s.written).toEqual([]);
    await Promise.resolve();
    expect(called).toBe(true);
  });

  it('writes a line while exactly the cap is waiting', () => {
    const s = fake({ writableLength: DROP_PAST_BYTES });
    letTheTerminalFallBehind(s);
    s.write('kept\n');
    expect(s.written).toEqual(['kept\n']);
  });

  it('leaves output that is not a terminal alone: a file or a pipe never waits on a person', () => {
    const s = fake({ isTTY: false });
    const write = s.write;
    expect(letTheTerminalFallBehind(s)).toBe(false);
    expect(s.blocking).toBe(true);
    expect(s.write).toBe(write);
  });
});

it('the app does it for its own output before any other module of its own runs', () => {
  const entry = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).main;
  const main = fs.readFileSync(path.join(ROOT, entry), 'utf8');
  const ownImports = [...main.matchAll(/^import\s+(?:[^'"]*from\s+)?['"](\.[^'"]+)['"]/gm)].map((m) => m[1]);
  expect(ownImports[0]).toBe('./terminal-falls-behind.mts');
  const early = fs.readFileSync(path.join(ROOT, 'main/terminal-falls-behind.mts'), 'utf8');
  expect(early).toContain('letTheTerminalFallBehind(process.stdout)');
  expect(early).toContain('letTheTerminalFallBehind(process.stderr)');
});
