// WHERE THE SUITE LOOKS FOR TESTS, AND WHY IT IS NOT EVERYWHERE.
//
// Until this file existed there was no vitest config at all, so vitest used its
// own default include, `**/*.{test,spec}.?(c|m)[jt]s?(x)`, and walked every
// folder under the repo root except node_modules. That is fine in a repo nobody
// works in from two places at once. This is not that repo.
//
// Agents here work in git worktrees, and two of them had been made INSIDE the
// checkout, at wt/clip-today and wt/clip-with. Measured on her repo on
// 2026-08-24: 205 test files in tests/, which are hers, plus 376 more in those
// two copies, which belong to somebody's half-finished branch. The runner did
// nearly three times the work, and six red tests in that borrowed half refused
// a push whose own code was completely green. Her answer: "Fix the guard so
// pushes stop being blocked by stray copies."
//
// The scope below is the fix, and the anchor is the part that matters. Every
// test in this project lives in tests/, so the include starts there. A nested
// copy keeps its tests at <copy>/tests/..., which `tests/**` cannot reach, so
// this holds for a copy called anything rather than only for one called wt.
// The exclude is a second belt for the same thing, in case a later change
// widens the include again.
//
// Worktrees belong in /tmp, which is where the other ninety are. Nothing here
// deletes the two in wt/; they are somebody else's live work.
import { configDefaults, defineConfig } from 'vitest/config';

export const SUITE_INCLUDE = ['tests/**/*.test.mjs'];

export const SUITE_EXCLUDE = [
  ...configDefaults.exclude,
  // A worktree made inside the checkout instead of in /tmp.
  '**/wt/**',
  // The packaged app and anything unpacked beside it. Gitignored, and the .app
  // bundles carry a whole second copy of the source.
  'release/**',
];

export default defineConfig({
  test: {
    include: SUITE_INCLUDE,
    exclude: SUITE_EXCLUDE,
    // Every test file gets its own throwaway ~/.astral, so nothing in the suite
    // can touch the real one. See tests/agentbox-home.setup.mjs.
    setupFiles: ['tests/agentbox-home.setup.mjs'],
    // ROOM FOR A MAC THAT IS NEVER IDLE (w-c121bd85e6, 2026-10-04). Vitest's
    // defaults, 5 s for a test and 10 s for a hook, are written for a laptop
    // running one suite. A dozen agents share this one, and the end-to-end
    // tests here drive real child processes: measured that day, the signed-out
    // Codex file ran its 8 tests in 1,592 ms alone at load 63 and hit the
    // ten-second ceiling at load 114. Two ships bounced on it in half an hour
    // with nothing wrong with either branch.
    //
    // Nothing fast is slowed by this: a test that finishes in 40 ms still
    // finishes in 40 ms, and only a test that is genuinely stuck pays the
    // wait. Tests that wait on real work should wait with tests/waiting.mjs,
    // whose deadline sits under these so that its message — which names what
    // the test was waiting for — is the one that gets shown.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
