// Where Claude Code actually is, on a machine that is not ours.
//
// THIS FILE IS NOW THE NAMES AND NOTHING ELSE. The search, the registry entry
// that declares Claude Code, the measured notes about where it installs and the
// `found` / `certain` rule all live in main/engine-bin.mts, which does the same
// job for every coding agent the app can run. Until 2026-10-08 this was 338
// lines and main/codex-bin.mts was 279, and they were two copies of one idea:
// adding a harness meant a third file and three hundred lines of test.
//
// WHAT IS KEPT HERE is the vocabulary the rest of the app already imports --
// main/config.mts, main/settings.mts, scripts/read-claude-commands.mjs,
// scripts/read-claude-models.mjs -- plus `askShell` and `shellProbes`, which
// several tests reach for through this file because Claude Code is the binary the
// app will not open an inbox without.
//
// THE RULE THIS FILE ARGUED FOR AND engine-bin.mts KEEPS: never tell somebody
// Claude Code is missing unless we are certain it is. `found` is whether a
// runnable file is really there, and it decides which path gets spawned.
// `certain` is whether we are entitled to SAY it is missing.
//
// Nothing here overrides the config file. An explicit `claudeBin` in
// zero.config.json wins untouched and is never searched around.

import os from 'node:os';
import {
  ENGINES, findEngine, resolveEngine, forgetEngine, installEvidence as evidenceFor,
  versionedBinPaths, askShell, shellProbes,
  type EngineSearch, type EvidenceOptions, type FindEngineOptions, type Readdir, type ResolveEngineOptions,
} from './engine-bin.mts';

export { askShell, shellProbes };

const CLAUDE = ENGINES.claude;

export const INSTALL_URL = CLAUDE.installUrl;

/** Every normal home for this binary, in order; the first that exists wins. */
export function candidatePaths(home: string = os.homedir()): string[] {
  return CLAUDE.candidates(home, () => []);
}

/** One bin directory per installed Node, read rather than guessed. */
export function versionedPaths(home: string = os.homedir(), readdir: Readdir | undefined = undefined): string[] {
  return versionedBinPaths('claude', home, readdir);
}

/** The copy the Claude desktop app keeps for itself, newest version first. */
export function appCopyPaths(home: string = os.homedir(), readdir: Readdir | undefined = undefined): string[] {
  return CLAUDE.appCopies(home, readdir);
}

/** What Claude Code leaves behind. None of it is ever spawned. */
export function evidencePaths(home: string = os.homedir()): string[] {
  return CLAUDE.evidence(home, {});
}

export function installEvidence({ home = os.homedir(), exists, dangles }: Pick<EvidenceOptions, 'home' | 'exists' | 'dangles'> = {}): string | null {
  return evidenceFor('claude', { home, env: {}, exists, dangles });
}

/** The whole search. See main/engine-bin.mts for what each answer means. */
export function findClaudeBin(where: FindEngineOptions = {}): EngineSearch {
  return findEngine('claude', where);
}

/** The same search with the shell step held for thirty seconds. */
export function resolveClaudeBin(configured: string | null = null, where: ResolveEngineOptions = {}): EngineSearch {
  return resolveEngine('claude', configured, where);
}

export function forgetClaudeBin(): void {
  forgetEngine('claude');
}
