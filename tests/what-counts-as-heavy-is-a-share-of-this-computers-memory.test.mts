// WHAT COUNTS AS HEAVY IS A SHARE OF THIS COMPUTER'S MEMORY.
//
// What broke: the memory gate learns what each command takes from its own
// runs on each computer, but it judged them against two lines measured on one
// 16 GB Mac: light under 150 MB, heavy from 400 MB. On 23 November 2026 that
// was asked about: a test run that is nothing on a 64 GB computer was held
// like a build, and on an 8 GB one a 300 MB run, a twentieth of everything it
// has, was let through as not heavy. And the record kept only the letter, so
// nothing could ask whether a command would fit in what the computer had
// left: a 2.2 GB build and a 450 MB script were both "h".
//
// Now the two lines are the same shares of whatever memory the computer has
// (they come to 150 and 400 MB at 16 GB, so nothing moves there), and the
// record keeps what a command took, in megabytes, the last few times it was
// not light.
import { describe, expect, it } from 'vitest';
import { CommandHistory, HEAVY_MB, LIGHT_MB, linesFor } from '../main/memory-gate-history.mts';

const GB = 1024;
const ran = (h: CommandHistory, command: string, peakMb: number, times = 1) => { for (let i = 0; i < times; i++) h.record(command, { peakMb, durationMs: 30_000 }); };

describe('the two lines are shares of the computer\'s memory', () => {
  it('come to the measured 150 and 400 MB on the 16 GB they were measured on', () => {
    expect(linesFor(16 * GB)).toEqual({ lightMb: 150, heavyMb: 400 });
    expect([LIGHT_MB, HEAVY_MB]).toEqual([150, 400]);
    // And a history told nothing about the computer keeps them.
    const h = new CommandHistory();
    expect([h.lightMb, h.heavyMb]).toEqual([150, 400]);
  });

  it('halve on 8 GB and are four times as much on 64 GB', () => {
    expect(linesFor(8 * GB)).toEqual({ lightMb: 75, heavyMb: 200 });
    expect(linesFor(64 * GB)).toEqual({ lightMb: 600, heavyMb: 1600 });
    expect(linesFor(18 * GB)).toEqual({ lightMb: 169, heavyMb: 450 });
  });

  it('a memory size it cannot read leaves the measured lines', () => {
    for (const odd of [0, -1, NaN, undefined, null, 'lots']) expect(linesFor(odd)).toEqual({ lightMb: 150, heavyMb: 400 });
  });

  it('the same 300 MB test run is heavy on 8 GB, in between on 16 GB and light on 64 GB', () => {
    const verdict = (ramGb: number) => {
      const h = new CommandHistory({ ramMb: ramGb * GB });
      ran(h, 'npm test', 300, 2);
      return h.classify('npm test');
    };
    expect(verdict(8)).toBe('heavy');
    expect(verdict(16)).toBe('unknown');
    expect(verdict(64)).toBe('light');
  });

  it('either side of the line: one megabyte under heavy is not heavy', () => {
    const h = new CommandHistory({ ramMb: 64 * GB });
    ran(h, 'make a', 1599, 2);
    ran(h, 'make b', 1600);
    expect(h.classify('make a')).toBe('unknown');
    expect(h.classify('make b')).toBe('heavy');
  });

  it('lines handed to it outright are kept, whatever the memory', () => {
    const h = new CommandHistory({ ramMb: 64 * GB, lightMb: 10, heavyMb: 20 });
    expect([h.lightMb, h.heavyMb]).toEqual([10, 20]);
  });

  it('a record read back is judged by the computer that reads it', () => {
    const h = new CommandHistory({ ramMb: 16 * GB });
    ran(h, 'npm test', 300, 2);
    const raw = JSON.parse(JSON.stringify(h.toJSON()));
    const back = CommandHistory.fromJSON(raw, { ramMb: 8 * GB });
    expect(back.heavyMb).toBe(200);
    ran(back, 'npm test', 300);
    expect(back.classify('npm test')).toBe('heavy');
  });
});

describe('the record keeps what a command took', () => {
  it('the middle of the last five runs that were not light', () => {
    const h = new CommandHistory();
    expect(h.usualMb('npm run build')).toBe(null);
    ran(h, 'npm run build', 2200);
    expect(h.usualMb('npm run build')).toBe(2200);
    ran(h, 'npm run build', 1800);
    ran(h, 'npm run build', 2600);
    expect(h.usualMb('npm run build')).toBe(2200);
    // Six runs on, the first has gone: the last five are 1800 2600 900 900 900.
    ran(h, 'npm run build', 900, 3);
    expect(h.usualMb('npm run build')).toBe(900);
  });

  it('a light run is not a size worth keeping, and says nothing of how big it gets', () => {
    const h = new CommandHistory();
    ran(h, 'git status', 12, 5);
    expect(h.usualMb('git status')).toBe(null);
    ran(h, 'npm run lint', 60, 4);
    ran(h, 'npm run build', 2000);
    // One key for both: what it took when it was not light.
    expect(h.usualMb('npm run lint')).toBe(2000);
  });

  it('a chain it has measured answers for itself', () => {
    const h = new CommandHistory();
    ran(h, 'npx vitest run 2>&1 | tail -5', 1300);
    expect(h.usualMb('npx vitest run tests/a.test.mts 2>&1 | tail -9')).toBe(1300);
  });

  it('a chain it has not seen is as big as its biggest part that is not light', () => {
    const h = new CommandHistory();
    for (let i = 0; i < 6; i++) { ran(h, `tail -20 /tmp/log${i}.txt`, 4); ran(h, `head -20 /tmp/log${i}.txt`, 4); }
    ran(h, 'npx vitest run tests/a.test.mts 2>&1 | tail -5', 40, 6);
    // Four heavy chains mark the test run, and their sizes go with the marks.
    for (const mb of [1200, 1400, 1300, 1900]) ran(h, 'npx vitest run 2>&1 | tail -5', mb);
    expect(h.classify('npx vitest run 2>&1 | head -5')).toBe('unknown');
    expect(h.usualMb('npx vitest run 2>&1 | head -5')).toBe(1350);
    // `head` was never in one of them, and `tail` was cleared by its own light runs.
    expect(h.usualMb('git log | head -5')).toBe(null);
    expect(h.usualMb('git log | tail -5')).toBe(null);
  });

  it('a part with a few marks that is still light lends no size', () => {
    const h = new CommandHistory();
    ran(h, 'git status --short | cut -c1-80', 20, 8);
    ran(h, 'git status --short && npm test', 1500);
    expect(h.classify('git status --short')).toBe('light');
    expect(h.usualMb('git status --short')).toBe(null);
    expect(h.usualMb('git status --short && npm test')).toBe(1500);
  });

  it('a record from before sizes were kept gives the line its letter crossed', () => {
    const old = { v: 1, keys: [['npm test', ['l', 'h', 'l']], ['node build.mjs', ['m', 'm']], ['git status', ['l', 'l']]], programs: [] };
    const h = CommandHistory.fromJSON(old);
    expect(h.usualMb('npm test')).toBe(400);
    expect(h.usualMb('node build.mjs')).toBe(150);
    expect(h.usualMb('git status')).toBe(null);
    expect(h.usualMb('cargo build')).toBe(null);
  });

  it('survives being written out and read back, and goes when its command is forgotten', () => {
    const h = new CommandHistory({ maxKeys: 3 });
    ran(h, 'npm run build', 2200, 2);
    const back = CommandHistory.fromJSON(JSON.parse(JSON.stringify(h.toJSON())), { maxKeys: 3 });
    expect(back.usualMb('npm run build')).toBe(2200);
    for (const name of ['a', 'b', 'c', 'd']) ran(back, `${name} x`, 5, 2);
    expect(back.keys.has('npm run')).toBe(false);
    expect(back.usualMb('npm run build')).toBe(null);
    expect(CommandHistory.fromJSON({ v: 1, keys: [], programs: [], sizes: 'nonsense' }).usualMb('x y')).toBe(null);
  });

  it('a run nobody measured, or measured with another, leaves no size', () => {
    const h = new CommandHistory();
    h.record('npm run build', { peakMb: null, durationMs: 90_000 });
    h.record('npm run build', { peakMb: 3000, durationMs: 90_000, onlyIfLight: true });
    expect(h.usualMb('npm run build')).toBe(null);
  });
});
