// Where Codex actually is, and whether we are entitled to say it is not here.
//
// THIS FILE IS NOW THE NAMES AND NOTHING ELSE. The search, the registry entry
// that declares Codex, and every measurement behind its paths live in
// main/engine-bin.mts, which does the same job for every coding agent the app
// can run. Until 2026-10-08 this was 279 lines beside main/claude-bin.mts's 338,
// and the two were copies of one idea: three of the seven commits they ever had
// are literally "one more install location".
//
// WHAT IS KEPT HERE is the vocabulary the rest of the app already imports --
// main/config.mts, main/settings.mts and main/codex-launch-env.mts, which builds
// the PATH a Codex opened from the desktop needs out of `candidatePaths` and
// `versionedPaths`.
//
// `found` decides which binary would be spawned and `certain` decides whether a
// screen may SAY there is nothing here, and they are never the same value.
//
// ONE DIFFERENCE FROM CLAUDE CODE, AND IT CHANGES THE SCREEN. Claude Code is
// required: the app will not open an inbox without it. Codex is optional, and an
// absence is the ordinary case rather than a fault. So nothing here ever produces
// a warning. All a missing Codex does is leave the second engine out of the map
// that shared/engines.mts reads, which is silence rather than a sentence about
// software nobody asked for.
//
// NOTHING HERE SPAWNS ANYTHING, AND main/config.mts IS WHAT CALLS IT.
// `resolveCodexBin` is what answers "is there a Codex on this machine", and its
// answer is the fact `engineFor` refuses on. Before it was wired in, a `codexBin`
// in zero.config.json arrived on `config` through the unknown-key spread and went
// to `spawn` with no finder and no existence check behind it.
//
// AND THERE IS A SETTINGS ROW NOW (w-ce8c1a9275): somebody whose Codex the
// search misses can point the app at the binary themselves, which is written
// back as `codexBin` and wins over everything below.

import os from 'node:os';
import {
  ENGINES, findEngine, resolveEngine, forgetEngine, installEvidence as evidenceFor,
  versionedBinPaths,
  type EngineSearch, type EvidenceOptions, type FindEngineOptions, type Readdir, type ResolveEngineOptions,
} from './engine-bin.mts';

const CODEX = ENGINES.codex;

export const INSTALL_URL = CODEX.installUrl;

/** Every normal home for this binary, in order; the first that exists wins. */
export function candidatePaths(home: string = os.homedir()): string[] {
  return CODEX.candidates(home, () => []);
}

/** One bin directory per installed Node, read rather than guessed. */
export function versionedPaths(home: string = os.homedir(), readdir: Readdir | undefined = undefined): string[] {
  return versionedBinPaths('codex', home, readdir);
}

/** The copies the ChatGPT and Codex desktop apps carry inside themselves. */
export function appCopyPaths(home: string = os.homedir()): string[] {
  return CODEX.appCopies(home);
}

/** What Codex leaves behind. None of it is ever spawned. */
export function evidencePaths(home: string = os.homedir(), env: NodeJS.ProcessEnv = process.env): string[] {
  return CODEX.evidence(home, env);
}

export function installEvidence({ home = os.homedir(), env = process.env, exists, dangles }: Pick<EvidenceOptions, 'home' | 'env' | 'exists' | 'dangles'> = {}): string | null {
  return evidenceFor('codex', { home, env, exists, dangles });
}

/** The whole search. See main/engine-bin.mts for what each answer means. */
export function findCodexBin(where: FindEngineOptions = {}): EngineSearch {
  return findEngine('codex', where);
}

/** The same search with the shell step held for thirty seconds. */
export function resolveCodexBin(configured: string | null = null, where: ResolveEngineOptions = {}): EngineSearch {
  return resolveEngine('codex', configured, where);
}

export function forgetCodexBin(): void {
  forgetEngine('codex');
}
