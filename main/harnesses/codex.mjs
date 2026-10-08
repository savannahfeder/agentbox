import path from 'node:path';
import { harnessDefinition } from '../../shared/harness-definitions.mjs';
import { resolveCodexBin } from '../codex-bin.mjs';
import { codexModels, codexDefaultModel, codexModelLevels } from '../codex-models.mjs';
import { codexTranscriptFile, workerThreadParams } from '../codex-session.mjs';
import { compactCodexThread } from '../codex-compaction.mjs';
import { captureCodexEvent, codexStreamingText, summarizeCodexEvent, traceCodexEvent, rememberCodexChange, changeFromCodexTurn } from '../codex.mjs';
import { codexActivity } from '../agent-activity.mjs';
import { runCodexCommand } from '../provider-commands.mjs';
import { definitionMethods, commonUpdatePlan } from './common.mjs';
const definition = harnessDefinition('codex');

export const codexHarness = {
  ...definitionMethods(definition),
  discover: resolveCodexBin,
  models: (options = {}) => codexModels(options),
  defaultModel: (options = {}) => codexDefaultModel(options),
  workspaceModel: sup => sup._codexWorkspaceModel(),
  profileHome: (sup, profile) => sup._codexProfileHome(profile),
  effortLevels: (model, options = {}) => codexModelLevels(model, options),
  profiles: sup => sup._codexProfiles(),
  signedIn: (sup, profile) => sup._codexSignedIn(profile),
  profileEnv: (env, profile, sup) => ({ ...env, [definition.homeEnv]: sup._codexProfileHome(profile) }),
  tooling: () => null,
  spawn: (sup, plan, context) => sup._spawnCodexWorker(plan, context),
  readers: () => ({ capture: captureCodexEvent, stream: codexStreamingText, summarize: summarizeCodexEvent, trace: traceCodexEvent, activity: codexActivity }),
  subscribe(child, session, absorb) {
    child.on('event', (method, params) => { rememberCodexChange(session, method, params); absorb(method, params); });
  },
  attachInput: () => {},
  transcript: (sup, rec) => rec?.sessionId ? codexTranscriptFile(rec.sessionId, { home: sup._codexProfileHome(rec.profile) }) : null,
  change: (session, options) => changeFromCodexTurn(session.codexChange ?? [], options),
  release: (sup, profile) => sup._releaseIdleCodex(profile),
  usage: sup => sup.codexUsage(),
  async compact(sup, rec, cwd) {
    const { client, handshake } = sup._codexServer(sup._codexProfileHome(rec.profile ?? 'default'));
    const mcpServers = await sup._codexIsolation(client, handshake);
    const params = workerThreadParams({ cwd, mcpServers, storeServer: null });
    return compactCodexThread({ server: client, threadId: rec.sessionId, threadParams: params });
  },
  settleApproval: (sup, ...args) => sup.settleCodexApproval(...args),
  approvalChanged: (sup, ...args) => sup.codexCardChanged(...args),
  memoryGate: sup => sup.codexMemoryGateEnv(),
  async runCommand(sup, { home, ...operation }) {
    const { client, handshake } = sup._codexServer(home);
    await handshake;
    return runCodexCommand({ server: client, ...operation });
  },
  updateSettings: () => ({}),
  updatePlan: options => commonUpdatePlan(definition, options, ({ bin, real, name }) => {
    const standalone = real.match(/^(.*)\/packages\/standalone\/(?:releases|current)\//);
    return standalone ? { name, file: '/bin/bash',
      args: ['-o', 'pipefail', '-c', '/usr/bin/curl -fsSL --connect-timeout 10 --max-time 60 https://chatgpt.com/codex/install.sh | /bin/sh'],
      env: { CODEX_HOME: standalone[1], CODEX_INSTALL_DIR: path.dirname(bin) },
      feed: 'https://releases.openai.com/codex/channels/latest', format: 'codex' } : null;
  }),
  smallModelArgs: prompt => ['exec', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules', '-s', 'read-only', '-c', 'model_reasoning_effort=low', prompt],
};
