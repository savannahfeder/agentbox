// THE PI ADAPTER. Registered, not admitted (shared/harness-definitions).
//
// pi prints its own JSON events. Each is rewritten as it arrives into the
// Claude Code line that means the same (piToClaude, main/pi.mjs), so the
// readers are Claude Code's and nothing downstream knows the difference. Its
// cards come from an extension loaded for each run with `-e`, which calls the
// same helper Grok's hook does (./asking.mjs).
//
// pi IS A NODE SCRIPT, and an app opened from the Dock has no shell PATH to
// find node on, so the folder its node lives in goes first on the worker's
// PATH (piNodeDir, measured: without it the run dies "env: node: No such file").
//
// DECLARED MISSING: input into a live run, fork, usage and plan limits, and a
// sign-in command (`/login` is inside pi's own terminal UI).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { harnessDefinition } from '../../shared/harness-definitions.mjs';
import { nameSlug } from '../../shared/product-name.mjs';
import { storeRootEnv } from '../store/home.mjs';
import { claudeActivity } from '../agent-activity.mjs';
import { findPiBin, piArgs, piModels, piNodeDir, piToClaude, piTranscriptFile, PI_APPROVAL_EXTENSION, PI_EFFORTS } from '../pi.mjs';
import { captureStream, streamingText, summarizeStreamLine, traceStreamLine } from './claude-stream.mjs';
import { approvalEnv, rowEnv, readLines } from './asking.mjs';
import { definitionMethods } from './common.mjs';

const definition = harnessDefinition('pi');
const piHome = sup => sup?.config?.piHome || path.join(os.homedir(), '.pi', 'agent');

/** The approval extension, written once where pi can load it, or null. */
export function piExtensionFile(dir = os.tmpdir()) {
  const file = path.join(dir, `${nameSlug}-pi-approvals.mjs`);
  try {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== PI_APPROVAL_EXTENSION) fs.writeFileSync(file, PI_APPROVAL_EXTENSION);
    return file;
  } catch { return null; }
}

export const piHarness = {
  ...definitionMethods(definition),
  discover: (config = {}) => {
    const found = findPiBin({ configured: config?.[definition.binKey] ?? null });
    return found.found ? found.path : null;
  },
  install: () => null,
  signIn: () => null,
  signInStatus: () => null,
  models: ({ bin } = {}) => (bin ? piModels({ bin, nodeDir: piNodeDir(bin) }).models : []),
  defaultModel: ({ bin } = {}) => (bin ? piModels({ bin, nodeDir: piNodeDir(bin) }).default : null),
  workspaceModel: () => null,
  effortLevels: () => [...PI_EFFORTS],
  profiles: () => ['default'],
  signedIn: () => true,
  profileHome: () => null,
  profileEnv: env => env,
  tooling: () => null,
  spawn(sup, plan, { cwd, item, env }) {
    const bin = sup.config[definition.binKey];
    const asking = approvalEnv(sup, 'pi');
    const extension = asking.AGENTBOX_ASK ? piExtensionFile() : null;
    const nodeDir = sup.config.piNodeDir ?? piNodeDir(bin);
    return spawn(bin, piArgs({ ...plan, extension }), {
      cwd,
      env: { ...env, ...asking, PATH: [nodeDir, env.PATH].filter(Boolean).join(path.delimiter), ...rowEnv(sup, item, storeRootEnv) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  },
  readers: () => ({ capture: captureStream, stream: streamingText, summarize: summarizeStreamLine, trace: traceStreamLine, activity: claudeActivity }),
  subscribe(child, session, absorb) {
    const state = session.piState ??= {};
    readLines(child, line => { for (const said of piToClaude(line, state)) absorb(said); });
  },
  transcript: (sup, rec) => (rec?.sessionId ? piTranscriptFile(rec.sessionId, { home: piHome(sup) }) : null),
  change: () => null,
  release: () => {},
  memoryGate: () => ({}),
  updateSettings: () => ({}),
  updatePlan: () => null,
};
