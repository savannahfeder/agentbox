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
import { claudeStreamArgs, attachClaudeInput } from '../claude-input.mjs';
import { claudeActivity } from '../agent-activity.mjs';
import { captureStream, streamingText, summarizeStreamLine, traceStreamLine } from './claude-stream.mjs';
import { definitionMethods, commonUpdatePlan } from './common.mjs';
const definition = harnessDefinition('claude');

export const claudeHarness = {
  ...definitionMethods(definition),
  discover: resolveClaudeBin,
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
  spawn(sup, plan, { cwd, item, profile, env }) {
    return spawn(sup.config.claudeBin, claudeStreamArgs(plan.args), {
      cwd,
      env: { ...env, STORE_ACCOUNT_ID: sup.config.accountId, ...storeRootEnv(sup.config.storeRoot),
        ...(profile !== 'default' ? { CLAUDE_CONFIG_DIR: profile } : {}),
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
    const projects = path.join(home, 'projects');
    const slug = String(rec.cwd ?? '').replace(/[^a-zA-Z0-9]/g, '-');
    const direct = path.join(projects, slug, `${rec.sessionId}.jsonl`);
    if (fs.existsSync(direct)) return direct;
    try { for (const dir of fs.readdirSync(projects)) {
      const file = path.join(projects, dir, `${rec.sessionId}.jsonl`);
      if (fs.existsSync(file)) return file;
    } } catch {}
    return null;
  },
  change: () => null,
  release: () => {},
  memoryGate: (sup, item) => sup.memoryGateEnv(item),
  smallModelArgs: (prompt, model) => ['-p', prompt, '--model', model],
  updateSettings: ({ home }) => {
    try { return JSON.parse(fs.readFileSync(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'settings.json'), 'utf8')); }
    catch { return {}; }
  },
  updatePlan: options => commonUpdatePlan(definition, options, ({ bin, real, home, channel, name }) =>
    real.startsWith(path.join(home, '.local/share/claude/versions') + '/')
      ? { name, file: bin, args: ['update'], feed: `https://downloads.claude.ai/claude-code-releases/${channel}`, format: 'text' } : null),
};
