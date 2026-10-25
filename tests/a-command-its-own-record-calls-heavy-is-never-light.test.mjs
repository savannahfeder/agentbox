// A COMMAND ITS OWN RECORD CALLS HEAVY IS NEVER LIGHT.
//
// WHAT BROKE. The commands that actually eat gigabytes were not going through
// the heavy slots at all. Measured on a 16 GB M4 by replaying 9,104 real Bash
// commands through the real classifier loaded with that Mac's learned history:
// of 322 commands whose own whole-command record had been measured heavy at
// least once, 66 classified LIGHT. Light needs no slot, starts even while
// pressure is `tight`, and is bounded only by `lightLane`, so eight could run
// at once. That accounts for a 10.6 GB swap storm better than two slots of
// 1.5 GB does.
//
// The case, as it stood:
//     command    npx vitest run tests/a-row.test.mjs 2>&1 | tail -30
//     chain key  "npx vitest && tail"   record hmllllmmlm   last five lmmlm
//     segments   npx vitest=llllllllll   tail=llllllllll
//     verdict    light
// `classify` read the chain record only for an 'h' among the last five, so one
// heavy run and three middling ones lost to segment records that said light.
// Those segments say light because `record` only tells a chain's parts about
// the chains that came out light. That drift is its own problem; this stops it
// deciding the verdict.
//
// WHAT THIS PINS: a command's own record outranks the records of its parts.
//
// Chosen over three wider variants measured on the same corpus: all closed the
// 66 escapes, this moved the fewest commands out of light, 0.7% of traffic.
//
// It does not settle the slot count. A transcript's only duration is waiting
// and running added together, so that needs the per-grant log instead.

import { describe, it, expect } from 'vitest';
import { CommandHistory } from '../main/memory-gate-history.mjs';

/** A history whose records are exactly these letters. A key with a space is a
 *  command key (a chain key included); a bare word is a program record. */
function withRecords(records) {
  const h = new CommandHistory();
  for (const [key, obs] of Object.entries(records)) {
    (key.includes(' ') ? h.keys : h.programs).set(key, obs.split(''));
  }
  return h;
}

describe('a command its own record calls heavy is never light', () => {
  it('calls the measured test suite heavy, though both its parts are learned light', () => {
    // The case from the Mac, letter for letter.
    const h = withRecords({
      'npx vitest && tail': 'hmllllmmlm',
      'npx vitest': 'llllllllll',
      tail: 'llllllllll',
      npx: 'llllllllll',
    });
    expect(h.classify('npx vitest run tests/a-row.test.mjs 2>&1 | tail -30')).toBe('heavy');
  });

  it('reaches an h at the very oldest of the ten runs it keeps', () => {
    const h = withRecords({
      'npx vitest && tail': 'hlllllllll',
      'npx vitest': 'llllllllll',
      tail: 'llllllllll',
      npx: 'llllllllll',
    });
    expect(h.classify('npx vitest run tests/a-row.test.mjs 2>&1 | tail -30')).toBe('heavy');
  });

  it('keeps a command measured middling out of the light lane, without calling it heavy', () => {
    // Caught on the live record while this was written: the record had aged on
    // to `mllllmmlmm`, the heavy run gone and four middling ones left, and an
    // 'h'-only rule called that light again, and light is the lane where eight
    // start at once. `unknown` rather than `heavy` is the right strength: it
    // needs a slot to start, and `_holdsSlot` returns the slot once a run
    // measures small.
    const h = withRecords({
      'npx vitest && tail': 'mllllmmlmm',
      'npx vitest': 'llllllllll',
      tail: 'llllllllll',
      npx: 'llllllllll',
    });
    expect(h.classify('npx vitest run tests/a-row.test.mjs 2>&1 | tail -30')).toBe('unknown');
  });

  it('reaches a single middling run at the oldest of the ten', () => {
    const h = withRecords({
      'npx vitest && tail': 'mlllllllll',
      'npx vitest': 'llllllllll',
      tail: 'llllllllll',
      npx: 'llllllllll',
    });
    expect(h.classify('npx vitest run tests/a-row.test.mjs 2>&1 | tail -30')).toBe('unknown');
  });

  it('lets a command go once the heavy run has fallen off the ten it keeps', () => {
    // The boundary on the other side: the record holds ten, so ten light runs
    // since is the evidence that whatever it was has changed.
    const h = withRecords({
      'npx vitest && tail': 'llllllllll',
      'npx vitest': 'llllllllll',
      tail: 'llllllllll',
      npx: 'llllllllll',
    });
    expect(h.classify('npx vitest run tests/a-row.test.mjs 2>&1 | tail -30')).toBe('light');
  });

  it('does not let a heavy chain condemn a part of it on its own', () => {
    // The rule this must not break: `git status && npm test` measured heavy
    // says nothing bad about `git status`.
    const h = withRecords({
      'git status && npm test': 'hhhhhhhhhh',
      'git status': 'llllllllll',
      'npm test': 'llllllllll',
      git: 'llllllllll',
      npm: 'llllllllll',
    });
    expect(h.classify('git status && npm test')).toBe('heavy');
    expect(h.classify('git status')).toBe('light');
    expect(h.classify('git status --porcelain')).toBe('light');
  });

  it('leaves a command nothing has ever measured big alone', () => {
    // 84% of what agents run is light and must stay light: the gate is worth
    // nothing if ordinary reading and searching queues behind a build.
    const h = withRecords({
      'git fetch && tail && git branch && head': 'llllllllll',
      'git fetch': 'llllllllll',
      'git branch': 'lllll?llll',
      tail: 'llllllllll',
      head: 'llllllllll',
      git: 'llllllllll',
    });
    expect(h.classify('git fetch -q origin | tail -2; git branch -r --contains abc | head -3')).toBe('light');
  });

  it('still reads an unmeasured run as nothing at all', () => {
    // A `?` must not be a way back in for over-holding that was already taken
    // out: it is the absence of evidence, and counting it would hold a command
    // for using 0 MB.
    const h = withRecords({
      'npx vitest && tail': '??????????',
      'npx vitest': 'llllllllll',
      tail: 'llllllllll',
      npx: 'llllllllll',
    });
    expect(h.classify('npx vitest run tests/a-row.test.mjs 2>&1 | tail -30')).toBe('light');
  });

  it('holds a single-segment command its own record calls heavy', () => {
    // The same hole exists with no chain in sight: one command, one program,
    // its own record measured heavy nine runs ago and light since.
    const h = withRecords({ 'npm test': 'hlllllllll', npm: 'llllllllll' });
    expect(h.classify('npm test')).toBe('heavy');
  });
});
