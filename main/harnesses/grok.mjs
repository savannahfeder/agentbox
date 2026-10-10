// THE GROK BUILD ADAPTER. Registered, not admitted (shared/harness-definitions).
//
// Grok's headless stream is Claude Code's stream-json, so this is mostly what
// differs: the command line (main/grok.mjs, measured one flag at a time), where
// its sessions are kept, and how it raises a card -- a PreToolUse hook in
// ~/.grok/hooks that does nothing unless this app started the run
// (main/grok-approvals.mjs).
//
// DECLARED MISSING: input into a live run (Grok has no stream-json input, so a
// reply waits for the run to end and resumes it), fork, usage and plan limits,
// and a sign-in command (it signs in from its own terminal UI).
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { harnessDefinition } from '../../shared/harness-definitions.mjs';
import { storeRootEnv } from '../store/home.mjs';
import { claudeActivity } from '../agent-activity.mjs';
import { findGrokBin, grokArgs, grokModels, grokTranscriptFile, GROK_EFFORTS } from '../grok.mjs';
import { ensureGrokApprovalHook } from '../grok-approvals.mjs';
import { captureStream, streamingText, summarizeStreamLine, traceStreamLine } from './claude-stream.mjs';
import { approvalEnv, rowEnv, readLines } from './asking.mjs';
import { definitionMethods } from './common.mjs';

const definition = harnessDefinition('grok');
const grokHome = sup => sup?.config?.grokHome || path.join(os.homedir(), '.grok');

export const grokHarness = {
  ...definitionMethods(definition),
  discover: (config = {}) => {
    const found = findGrokBin({ configured: config?.[definition.binKey] ?? null });
    return found.found ? found.path : null;
  },
  install: () => null,
  signIn: () => null,
  signInStatus: () => null,
  models: ({ bin } = {}) => (bin ? grokModels({ bin }).models : []),
  defaultModel: ({ bin } = {}) => (bin ? grokModels({ bin }).default : null),
  workspaceModel: () => null,
  effortLevels: () => [...GROK_EFFORTS],
  // One sign-in, Grok's own, and no second-account folders.
  profiles: () => ['default'],
  signedIn: () => true,
  profileHome: () => null,
  profileEnv: env => env,
  tooling: () => null,
  spawn(sup, plan, { cwd, item, env }) {
    const asking = approvalEnv(sup, 'grok', { ready: () => ensureGrokApprovalHook({ grokHome: grokHome(sup) }) });
    return spawn(sup.config[definition.binKey], grokArgs(plan.args, { model: plan.model, effort: plan.effort }), {
      cwd,
      env: { ...env, ...asking, ...rowEnv(sup, item, storeRootEnv) },
      // Nothing on stdin: Grok takes its prompt on the command line.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  },
  readers: () => ({ capture: captureStream, stream: streamingText, summarize: summarizeStreamLine, trace: traceStreamLine, activity: claudeActivity }),
  subscribe: (child, _session, absorb) => readLines(child, absorb),
  transcript: (sup, rec) => (rec?.sessionId ? grokTranscriptFile(rec.sessionId, { home: grokHome(sup), cwd: rec.cwd ?? null }) : null),
  // Grok's session file is not Claude Code's transcript, so a run's change is
  // read from the repository alone rather than misread from it.
  change: () => null,
  release: () => {},
  memoryGate: () => ({}),
  updateSettings: () => ({}),
  updatePlan: () => null,
};
