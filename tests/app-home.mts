// THE APP'S HOME, SET UNDER EVERY NAME THIS APP HAS HAD.
//
// `appHome` reads `AGENTBOX_HOME` first and falls back through the older
// spellings, because a shell, a launchd job or a process started before a
// rename still exports the old one (main/store/home.mjs). A test that sets only
// ONE of those names therefore does not decide where the code writes: it
// decides it only on a machine where no newer spelling is set.
//
// AND ON THE MACHINE THAT MATTERS, A NEWER ONE IS ALWAYS SET. Agentbox exports
// the store root under all four names into every worker it spawns
// (`storeRootEnv`), so a suite run from inside a worker session had
// `AGENTBOX_HOME=/Users/<her>/Zero` in its environment. The setup file set
// `ASTRAL_HOME` to a temp directory, `AGENTBOX_HOME` won, and the tests wrote
// into HER REAL STORE ROOT while asserting against the temp one. Measured
// 2026-09-23 on w-1be7222bc9: 19 tests in 5 files red in an agent session and
// green in a terminal, on the same commit, which is the worst shape a test can
// have. The writes were the real damage; the red was the symptom that found it.
//
// So the home is set and cleared under every name, together, from here.

import { envNames } from '../shared/product-name.mjs';

const KEYS = envNames('HOME');

/** Point the app's home at `dir`, under every name it answers to. */
export function setAppHome(dir) {
  for (const key of KEYS) process.env[key] = dir;
}

/** Unset it under every name, so nothing inherited is left deciding. */
export function clearAppHome() {
  for (const key of KEYS) delete process.env[key];
}

/** What the app will actually read, which is the newest name that is set. */
export function appHomeEnv() {
  for (const key of KEYS) if (process.env[key]) return process.env[key];
  return undefined;
}
