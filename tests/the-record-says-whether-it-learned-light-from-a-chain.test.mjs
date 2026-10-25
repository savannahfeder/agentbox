// THE RECORD SAYS WHETHER IT LEARNED LIGHT FROM A CHAIN.
//
// WHAT BROKE. `record` tells a chain's parts nothing unless the chain came out
// light, so a segment key and a program record hear only about light chains.
// Agents here nearly always run heavy work as a chain, so on a 16 GB M4 the
// program record `npx` stood at ten light runs and no other letter, though
// `npx` runs every test suite in this repo. A command whose own key has no
// record falls through to that program record, so
// `npx vite build renderer 2>&1 | tail -5` came out light: no slot, started
// even under `tight` pressure, up to `lightLane` of them at once.
//
// WHY THIS ONLY RECORDS. The fix would be to stop generalising from a program
// record whose light evidence is all chain-derived, and that cannot be chosen
// yet: the record never said which observations came from a chain, so the cost
// of distrusting them was unmeasurable on any machine. The cost is not
// hypothetical. A never-seen argument of an ordinary program (`grep <a new
// pattern>`) leans on that same generalisation, and turning those into
// `unknown` is the over-holding a previous fix removed, 89 seconds of waiting
// to use 0 MB.
//
// So a chain's light run is filed on its parts as `c` instead of `l`. Every
// rule reads `c` as `l`, so no verdict moved. The chain key keeps `l`: its own
// reading did cover everything the command started.
//
// WHAT THIS PINS: where each letter goes, that `c` survives a save and load,
// and above all that no verdict moved.

import { describe, it, expect } from 'vitest';
import { CommandHistory } from '../main/memory-gate-history.mjs';

const letters = (map, key) => map.get(key)?.join('') ?? null;

describe('the record says whether it learned light from a chain', () => {
  it('files a plain light run as directly measured, on the key and the program', () => {
    const h = new CommandHistory();
    h.record('grep -rn needle main/', { peakMb: 30 });
    expect(letters(h.keys, 'grep needle')).toBe('l');
    expect(letters(h.programs, 'grep')).toBe('l');
  });

  it('files a light chain as chain-derived on its parts, and direct on the chain', () => {
    const h = new CommandHistory();
    h.record('npm run test:changed 2>&1 | tail -30', { peakMb: 40 });
    // The whole command really was measured at 40 MB, so its own record is direct.
    expect(letters(h.keys, 'npm run && tail')).toBe('l');
    // Its parts were never measured apart from each other.
    expect(letters(h.keys, 'npm run')).toBe('c');
    expect(letters(h.keys, 'tail')).toBe('c');
    expect(letters(h.programs, 'npm')).toBe('c');
    expect(letters(h.programs, 'tail')).toBe('c');
  });

  it('still tells the parts of a heavy chain nothing at all', () => {
    // THE RULE THIS MUST NOT BREAK. `git status && npm test` measured heavy says
    // nothing bad about `git status`, so the early return stays exactly as it was.
    const h = new CommandHistory();
    h.record('git status && npm test', { peakMb: 1200 });
    expect(letters(h.keys, 'git status && npm test')).toBe('h');
    expect(letters(h.keys, 'git status')).toBe(null);
    expect(letters(h.keys, 'npm test')).toBe(null);
    expect(letters(h.programs, 'git')).toBe(null);
    expect(letters(h.programs, 'npm')).toBe(null);
  });

  it('counts a command carrying $(...) as a chain, even with one segment', () => {
    // The reading covered whatever the substitution ran, so crediting the bare
    // segment as directly measured would claim more than was measured.
    const h = new CommandHistory();
    h.record('ls "$(dirname /tmp/x)"', { peakMb: 10 });
    // The key keeps the argument it was given, substitution and all.
    expect(letters(h.keys, 'ls $(dirname /tmp/x)')).toBe('c');
    expect(letters(h.programs, 'ls')).toBe('c');
  });

  it('changes no verdict: a key light twice from chains is still light', async () => {
    const h = new CommandHistory();
    h.record('git status --porcelain | head -5', { peakMb: 20 });
    h.record('git status --porcelain | head -5', { peakMb: 20 });
    expect(letters(h.keys, 'git status')).toBe('cc');
    expect(h.classify('git status --porcelain')).toBe('light');
  });

  it('changes no verdict: a program light five times from chains still lends it', () => {
    // This is the generalisation the drift rides on, and it is deliberately
    // left working. Taking it away is the decision this recording exists to
    // inform, and it is not made here.
    const h = new CommandHistory();
    for (const arg of ['a', 'b', 'c', 'd', 'e']) {
      h.record(`sed -n 1,5p ${arg}.txt | head -2`, { peakMb: 15 });
    }
    expect(letters(h.programs, 'sed')).toBe('ccccc');
    // An argument nothing has ever seen, resting only on the program record.
    expect(h.classify('sed -n 1,5p a-file-never-seen-before.txt')).toBe('light');
  });

  it('reads a record written before this change exactly as it always did', () => {
    const old = { v: 1, keys: [['npm run', ['l', 'l', 'l']]], programs: [['npm', ['l', 'l', 'l', 'l', 'l']]] };
    const h = CommandHistory.fromJSON(old);
    expect(letters(h.keys, 'npm run')).toBe('lll');
    expect(h.classify('npm run build')).toBe('light');
  });

  it('keeps the provenance across being saved and loaded', () => {
    const h = new CommandHistory();
    h.record('npm run test:changed 2>&1 | tail -30', { peakMb: 40 });
    const back = CommandHistory.fromJSON(JSON.parse(JSON.stringify(h.toJSON())));
    expect(letters(back.keys, 'npm run')).toBe('c');
    expect(letters(back.programs, 'npm')).toBe('c');
  });

  it('lets a direct heavy run still condemn a key its chains had called light', () => {
    // The whole point of keeping the two apart: when a direct reading finally
    // arrives it must outrank the chain-derived ones, which it does because
    // `h` is read the same wherever it came from.
    const h = new CommandHistory();
    for (let i = 0; i < 5; i++) h.record('npx vitest run tests/a.test.mjs | tail -5', { peakMb: 40 });
    expect(letters(h.keys, 'npx vitest')).toBe('ccccc');
    expect(h.classify('npx vitest run tests/b.test.mjs')).toBe('light');
    h.record('npx vitest run tests/b.test.mjs', { peakMb: 1400 });
    expect(h.classify('npx vitest run tests/b.test.mjs')).toBe('heavy');
  });
});
