import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { harnessDefinition } from '../../shared/harness-definitions.mjs';
import { EFFORT_LEVELS } from '../../shared/effort-levels.mjs';
import { storeRootEnv } from '../store/home.mjs';
import { resolveClaudeBin } from '../claude-bin.mjs';
import { claudeModelRows } from '../claude-models.mjs';
import { linkAccountTooling } from '../account-tooling.mjs';
import { streamInputArgs, attachClaudeInput } from '../claude-input.mjs';
import { claudeLaunchEnv } from '../claude-launch-env.mjs';
import { cloudClaudeMode, cloudPermissionArgs } from '../cloud-permission.mjs';
import { claudeActivity } from '../agent-activity.mjs';
import { captureStream, streamingText, summarizeStreamLine, traceStreamLine } from './claude-stream.mjs';
import { definitionMethods, commonUpdatePlan } from './common.mjs';
import { findTranscript } from '../transcript-search.mjs';
const definition = harnessDefinition('claude');

// THE SETTINGS LAYER THAT TAKES A METERED KEY BACK OFF A RUN. Claude Code reads
// `env.ANTHROPIC_API_KEY` and `apiKeyHelper` out of a person's own and a
// project's settings files, past any scrub of the environment, and `--settings`
// outranks both (measured on 2.1.301, w-6d8c543a43). Every Claude Code run the
// app starts carries it: workers in their settings file, small calls inline.
export const NO_METERED_KEY = Object.freeze({ env: Object.freeze({ ANTHROPIC_API_KEY: '' }), apiKeyHelper: '' });

export const claudeHarness = {
  ...definitionMethods(definition),
  discover: resolveClaudeBin,
  launchEnv: claudeLaunchEnv,
  models: ({ bin } = {}) => claudeModelRows({ bin: bin ?? null }).map(m => ({ id: m.alias, label: m.label })),
  defaultModel: () => null,
  workspaceModel: () => null,
  profileHome: () => null,
  effortLevels: () => EFFORT_LEVELS.map(e => e.id),
  profiles: sup => sup._profiles(),
  signedIn: () => true,
  profileEnv: (env, profile) => profile === 'default' ? env : { ...env, [definition.homeEnv]: profile },
  signInFiles({ folder, home }) {
    if (folder) return definition.credentialFiles.map(file => path.join(folder, file));
    const dir = path.join(home, '.claude');
    return [path.join(home, '.claude.json'), ...definition.credentialFiles.map(file => path.join(dir, file))];
  },
  tooling: profile => linkAccountTooling(profile),
  // A cloud run's command line and environment. A kit for the phone is made
  // from the same two (Supervisor#_writeKit), so the cloud's turn is this one.
  cloudLaunch(sup, plan, { item, profile, env }) {
    return {
      args: streamInputArgs(definition.run, cloudPermissionArgs(plan.args, cloudClaudeMode(sup.config.cloudPermission, plan.answerMode))),
      env: { ...env, STORE_ACCOUNT_ID: sup.config.accountId, ...storeRootEnv(sup.config.storeRoot),
        CLAUDE_CONFIG_DIR: sup._claudeConfigDir(profile), ZERO_PRODUCT: item.product, ZERO_ITEM: item.id, ...sup._cloudDocsEnv(item) },
    };
  },
  spawn(sup, plan, { cwd, item, profile, env, cloud = false }) {
    // A CLOUD RUN: THE SAME ARGUMENTS, A DIFFERENT PROGRAM (docs/cloud/PLAN.md).
    // main/cloud/run-cli.mjs runs Claude Code in the sandbox with exactly these
    // arguments and is, to everything above, the worker: its stdout is the
    // agent's stream, its stdin reaches the agent, its exit comes after the
    // agent's work is back in `cwd`. The account folder is always named,
    // because the run unpacks the transcript and tooling into exactly that
    // path. No memory-gate variables: that gate is about this Mac's memory.
    if (cloud) {
      const launch = claudeHarness.cloudLaunch(sup, plan, { item, profile, env });
      return sup._spawnCloudRelay(launch.args, { cwd, env: launch.env });
    }
    // The binary is the one this definition names, not a field spelled out
    // here: that is the last place an engine of this family needed code.
    return spawn(sup.config[definition.binKey], streamInputArgs(definition.run, plan.args), {
      cwd,
      env: { ...claudeLaunchEnv(sup.config[definition.binKey], env), STORE_ACCOUNT_ID: sup.config.accountId, ...storeRootEnv(sup.config.storeRoot),
        ...(profile !== 'default' ? { [definition.homeEnv]: profile } : {}),
        ZERO_PRODUCT: item.product, ZERO_ITEM: item.id, ...sup.memoryGateEnv(item) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  },
  readers: () => ({ capture: captureStream, stream: streamingText, summarize: summarizeStreamLine, trace: traceStreamLine, activity: claudeActivity }),
  subscribe(child, _session, absorb) {
    let buffer = '';
    child.stdout.on('data', data => {
      buffer += data.toString();
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        if (line.trim()) absorb(line);
      }
    });
  },
  attachInput: child => attachClaudeInput(child),
  transcript(sup, rec) {
    if (!rec?.sessionId) return null;
    const home = rec.profile && rec.profile !== 'default' ? rec.profile : path.join(os.homedir(), '.claude');
    return findTranscript(path.join(home, 'projects'), rec.sessionId, rec.cwd, { look: rec.cloud ? 'never' : 'now' });
  },
  change: () => null,
  release: () => {},
  memoryGate: (sup, item) => sup.memoryGateEnv(item),
  smallModelArgs: (prompt, model) => ['-p', prompt, '--model', model, '--settings', JSON.stringify(NO_METERED_KEY)],
  updateSettings: ({ home }) => {
    try { return JSON.parse(fs.readFileSync(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'settings.json'), 'utf8')); }
    catch { return {}; }
  },
  updatePlan: options => commonUpdatePlan(definition, options, ({ bin, real, home, channel, name }) =>
    real.startsWith(path.join(home, '.local/share/claude/versions') + '/')
      ? { name, file: bin, args: ['update'], feed: `https://downloads.claude.ai/claude-code-releases/${channel}`, format: 'text' } : null),
};
