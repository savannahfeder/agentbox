// A RUN THAT WAS NEVER MEASURED DOES NOT MAKE A COMMAND HEAVY — w-b689e9fc0c.
//
// WHAT BROKE. Agents reported ordinary file reads and test commands sitting
// pending for over a minute with no output, while store and image tools (which
// run no shell) answered normally, and then working again on the next reply
// with nothing in the repository changed. Measured on the founder's 16 GB M4,
// 2026-10-07, by polling the live coordinator's /status once a second for four
// minutes: 30 commands, 11 of them held, the longest waits 111 s, 99 s, 89 s,
// 85 s, 76 s, 64 s, 62 s and 61 s. Seven of those were later measured at under
// 150 MB — one of them at 0 MB — so they were not heavy work waiting its turn.
// The Mac really was short (1 GB available, 16.5 GB of 17.4 GB swap in use), so
// `tight` was the honest reading and holding heavy work was right. What was
// wrong was WHICH commands counted as heavy.
//
// THE CAUSE, traced through the real learned history on that Mac. A command is
// filed as `program firstArg` and judged on its last observations, where `?`
// means "ran, and nothing ever measured it". `git branch` stood at
// "lllll?llll": nine light runs and one unmeasured one. `_classifyKey` looked
// at the last five, saw the `?`, and returned `unknown` — and because the own
// record had answered, the `git` program record, ten light runs with nothing
// else in it, was never consulted. A chain is only as good as its worst part,
// so `git fetch -q origin | tail -2; git branch -r --contains <sha> | head -3`
// came out `unknown`, needed one of this Mac's two slots, was refused one while
// pressure was tight, and waited 89 seconds to use 0 MB. One unmeasured run
// poisons that command for its next nine runs, and a loaded Mac is exactly
// where runs go unmeasured (the sampler looks every 2 s and cannot see a
// command that is already over), so the gate made itself hold more and more.
//
// WHAT THIS PINS. `?` is the absence of evidence and is read as nothing at all:
// it never counts towards light, which is the rule that is not negotiable, and
// it no longer counts against it. `h` and `m` still do.

import { describe, it, expect } from 'vitest';
import { CommandHistory } from '../main/memory-gate-history.mjs';

/** A history whose record for `key` is exactly `obs`, letter for letter. */
function withRecord(records) {
  const h = new CommandHistory();
  for (const [key, obs] of Object.entries(records)) {
    const map = key.includes(' ') ? h.keys : h.programs;
    map.set(key, obs.split(''));
    if (map === h.keys) h.programs.set(key.split(' ')[0], h.programs.get(key.split(' ')[0]) ?? []);
  }
  return h;
}

describe('a run that was never measured does not make a command heavy', () => {
  it('reads the command the founder watched wait 89 seconds as light', () => {
    // The real records off that Mac: the key carries one unmeasured run.
    const h = withRecord({ 'git fetch': 'llllllllll', 'git branch': 'lllll?llll', tail: 'llllllllll', head: 'llllllllll', git: 'llllllllll' });
    expect(h._classifyKey('git branch')).toBe('light');
    expect(h.classify('git fetch -q origin 2>&1 | tail -2; git branch -r --contains b0decfd 2>/dev/null | head -3')).toBe('light');
  });

  it('reads a file the same way whichever program reads it', () => {
    // The reported examples: App.tsx with cat or sed, List.tsx with awk. One
    // unmeasured run of any of them used to hold the next nine.
    const h = withRecord({ cat: 'l?llllllll', sed: 'llll?lllll', awk: 'l?llllllll' });
    expect(h.classify('cat renderer/src/App.tsx')).toBe('light');
    expect(h.classify("sed -n '1,120p' renderer/src/App.tsx")).toBe('light');
    expect(h.classify("awk 'NR<80' renderer/src/components/List.tsx")).toBe('light');
  });

  it('still needs two measured runs before it calls a command light', () => {
    // One light run beside an unmeasured one is not "seen light more than once".
    expect(withRecord({ 'rg needle': '?l', rg: '' })._classifyKey('rg needle')).toBe('unknown');
    expect(withRecord({ 'rg needle': '?ll', rg: '' })._classifyKey('rg needle')).toBe('light');
  });

  it('falls through to the program when a command has nothing measured of its own', () => {
    expect(withRecord({ 'ls build': '??', ls: 'llllllllll' })._classifyKey('ls build')).toBe('light');
    expect(withRecord({ 'ls build': '??', ls: '' })._classifyKey('ls build')).toBe('unknown');
  });

  it('never lets missing evidence make a command light', () => {
    // The rule that is not negotiable: nothing measured is `unknown`, never light.
    expect(new CommandHistory().classify('some-program --flag')).toBe('unknown');
    expect(withRecord({ 'pytest tests': '??????????', pytest: '??????????' })._classifyKey('pytest tests')).toBe('unknown');
    // Four measured lights are not the five the program fallback asks for.
    expect(withRecord({ 'ls build': '', ls: 'l?l?l?l?' })._classifyKey('ls build')).toBe('unknown');
    expect(withRecord({ 'ls build': '', ls: 'l?l?l?l?l?' })._classifyKey('ls build')).toBe('light');
  });

  it('still counts a heavy or middling run against a command', () => {
    expect(withRecord({ 'npm test': 'll?h?', npm: 'llllllllll' })._classifyKey('npm test')).toBe('heavy');
    expect(withRecord({ 'npm build': 'll?m?', npm: 'llllllllll' })._classifyKey('npm build')).toBe('unknown');
    // And a program that has been heavy once lends nothing to an unseen argument.
    expect(withRecord({ 'npm view': '', npm: 'lllllhllll' })._classifyKey('npm view')).toBe('unknown');
  });

  it('keeps reading a real run of observations the way it always did', () => {
    // Nothing above changes what measurement itself means.
    const h = new CommandHistory();
    for (let i = 0; i < 3; i++) h.record('rg needle src', { peakMb: 20, durationMs: 300 });
    expect(h.classify('rg needle src')).toBe('light');
    h.record('rg needle src', { peakMb: 900, durationMs: 60_000 });
    expect(h.classify('rg needle src')).toBe('heavy');
  });
});
