// A SHIP RUNS THE TESTS ONCE.
//
// WHY, 2026-10-19. `npm run ship` ran `vitest related` on the changed files and
// then pushed, and the push runs the pre-push hook, which ran `vitest related`
// on the same files again. Every ship paid for its gate twice. Measured that
// evening: the 93 files a change to main/store.mjs pulls in took 77 s at load
// 16, so the pair cost about 160 s before anything left the Mac, and at the
// load this Mac actually runs at — 60 to 160 with twenty agents — a core
// change cost 12 minutes. Of 25 ships attempted in four hours, 12 landed.
//
// The hook is the gate that was kept, for two reasons. It is the one a push
// cannot get around, and it is the one that already knows a red test on a busy
// Mac is not a verdict: it runs the red files again on their own and only then
// refuses. The run in ship.mjs had no such retry, so a timing-sensitive test
// that lost its cores refused the ship outright and the whole thing started
// over.
//
// The script is read as text here. There is no way to run it for real without
// a remote to push to, and what has to stay true is a property of the script:
// it does not run the tests itself, and it does not get around the hook that
// does.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

describe('the ship script', () => {
  const ship = read('scripts/ship.mjs');

  it('does not run the tests itself, because the push it makes runs them', () => {
    expect(ship).not.toMatch(/vitest/);
  });

  it('does not cap the cores the tests get, which was its own run\'s cap', () => {
    // VITEST_MAX_FORKS=2 was there because two ships could overlap. One run
    // per ship, and the hook takes what the machine has.
    expect(ship).not.toMatch(/VITEST_(MAX|MIN)_FORKS/);
  });

  it('still never skips the hook, which is now the only test run a ship has', () => {
    expect(ship).not.toContain('--no-verify');
  });

  it('says that the push is where the tests happen', () => {
    expect(ship).toMatch(/hook runs the tests/i);
  });

  it('gives the push room to carry a whole test run back', () => {
    // The run is inside the push now, so its output comes back through that
    // buffer. Node's default is one megabyte, and a push that overruns it
    // returns no status at all, which reads as a refusal naming nothing.
    const megabytes = Number(/maxBuffer: (\d+) \* 1024 \* 1024/.exec(ship)?.[1]);
    expect(megabytes).toBeGreaterThanOrEqual(8);
  });
});

describe('the hook', () => {
  const hook = read('scripts/hooks/pre-push');

  it('is where the tests run', () => {
    expect(hook).toMatch(/vitest \$runargs/);
  });

  it('asks how much of the suite a push can afford, rather than running all of it', () => {
    expect(hook).toContain('tests-the-push-runs.mjs');
  });
});

describe('an agent still has one command for the tests for its own change', () => {
  it('is npm run test:changed, and it is not the ship', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['test:changed']).toContain('scripts/test-what-changed.mjs');
    expect(read('CLAUDE.md')).toContain('npm run test:changed');
  });
});
