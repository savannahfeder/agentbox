import path from 'node:path';
import type { EventEmitter } from 'node:events';
import { harnessDefinition } from '../../shared/harness-definitions.mts';
import { resolveCodexBin } from '../codex-bin.mts';
import { codexLaunchEnv } from '../codex-launch-env.mts';
import { codexModels, codexDefaultModel, codexModelLevels } from '../codex-models.mts';
import { codexTranscriptFile, workerThreadParams, refusedCodexWorker } from '../codex-session.mts';
import { codexKeyRefusal } from '../codex-account.mts';
import { compactCodexThread } from '../codex-compaction.mts';
import type { CompactServer } from '../codex-compaction.mts';
import { captureCodexEvent, codexStreamingText, summarizeCodexEvent, traceCodexEvent, rememberCodexChange, changeFromCodexTurn } from '../codex.mts';
import { codexActivity } from '../agent-activity.mts';
import { runCodexCommand } from '../provider-commands.mts';
import { definitionMethods, commonUpdatePlan } from './common.mts';
import type { Env, HarnessRecord, HarnessPlan, HarnessSession, HarnessSpawnContext, HarnessSupervisor, UpdatePlanOptions } from './common.mts';
const definition = harnessDefinition('codex')!;

export const codexHarness = {
  ...definitionMethods(definition),
  discover: resolveCodexBin,
  launchEnv: codexLaunchEnv,
  models: (options: Parameters<typeof codexModels>[0] = {}) => codexModels(options),
  defaultModel: (options: Parameters<typeof codexDefaultModel>[0] = {}) => codexDefaultModel(options),
  workspaceModel: (sup: HarnessSupervisor) => sup._codexWorkspaceModel(),
  profileHome: (sup: HarnessSupervisor, profile: string) => sup._codexProfileHome(profile),
  effortLevels: (model: string, options: Parameters<typeof codexModelLevels>[1] = {}) => codexModelLevels(model, options),
  profiles: (sup: HarnessSupervisor) => sup._codexProfiles(),
  signedIn: (sup: HarnessSupervisor, profile: string) => sup._codexSignedIn(profile),
  profileEnv: (env: Env, profile: string, sup: HarnessSupervisor) => ({ ...env, [definition.homeEnv]: sup._codexProfileHome(profile) }),
  tooling: () => null,
  // Codex carries the person's standing instructions as a thread's
  // `developerInstructions`, so it needs neither a flag nor a file. It says so
  // rather than inheriting the refusal meant for an engine that has nowhere to
  // put them (main/harnesses/instructions-file.mts).
  instructions: () => ({ by: 'thread' }),
  // AN API-KEY LOGIN IS REFUSED HERE, before an app-server is asked anything:
  // Codex reads the key out of auth.json itself, past the worker scrub, and
  // bills every call to it (main/codex-account.mts `codexKeyRefusal`).
  spawn: (sup: HarnessSupervisor, plan: HarnessPlan, context: HarnessSpawnContext) => {
    const refusal = codexKeyRefusal(sup._codexProfileHome(context?.profile ?? 'default'));
    return refusal ? refusedCodexWorker(refusal) : sup._spawnCodexWorker(plan, context);
  },
  readers: () => ({ capture: captureCodexEvent, stream: codexStreamingText, summarize: summarizeCodexEvent, trace: traceCodexEvent, activity: codexActivity }),
  subscribe(child: EventEmitter, session: HarnessSession, absorb: (method: string, params: unknown) => void): void {
    child.on('event', (method: string, params: unknown) => { rememberCodexChange(session, method, params); absorb(method, params); });
  },
  attachInput: () => {},
  transcript: (sup: HarnessSupervisor, rec: HarnessRecord | null | undefined) => rec?.sessionId ? codexTranscriptFile(rec.sessionId, { home: sup._codexProfileHome(rec.profile) }) : null,
  change: (session: HarnessSession, options: Parameters<typeof changeFromCodexTurn>[1]) => changeFromCodexTurn(session.codexChange ?? [], options),
  release: (sup: HarnessSupervisor, profile: string) => sup._releaseIdleCodex(profile),
  usage: (sup: HarnessSupervisor) => sup.codexUsage(),
  async compact(sup: HarnessSupervisor, rec: HarnessRecord, cwd: string) {
    const { client, handshake } = sup._codexServer(sup._codexProfileHome(rec.profile ?? 'default'));
    const mcpServers = await sup._codexIsolation(client, handshake);
    const params = workerThreadParams({ cwd, mcpServers, storeServer: null });
    return compactCodexThread({ server: client as CompactServer, threadId: rec.sessionId, threadParams: params });
  },
  settleApproval: (sup: HarnessSupervisor, ...args: unknown[]) => sup.settleCodexApproval(...args),
  approvalChanged: (sup: HarnessSupervisor, ...args: unknown[]) => sup.codexCardChanged(...args),
  memoryGate: (sup: HarnessSupervisor) => sup.codexMemoryGateEnv(),
  async runCommand(sup: HarnessSupervisor, { home, ...operation }: { home: string; threadId: string; cwd: string; name: string; args?: string }) {
    const { client, handshake } = sup._codexServer(home);
    await handshake;
    return runCodexCommand({ server: client, ...operation });
  },
  updateSettings: () => ({}),
  updatePlan: (options: UpdatePlanOptions) => commonUpdatePlan(definition, options, ({ bin, real, name }) => {
    const standalone = real.match(/^(.*)\/packages\/standalone\/(?:releases|current)\//);
    return standalone ? { name, file: '/bin/bash',
      args: ['-o', 'pipefail', '-c', '/usr/bin/curl -fsSL --connect-timeout 10 --max-time 60 https://chatgpt.com/codex/install.sh | /bin/sh'],
      env: { CODEX_HOME: standalone[1], CODEX_INSTALL_DIR: path.dirname(bin) },
      feed: 'https://releases.openai.com/codex/channels/latest', format: 'codex' } : null;
  }),
  // `--image=` with the value attached, because `-i <FILE>...` takes every
  // word after it, the prompt included.
  smallModelArgs: (prompt: string, _model?: string | null, pictures: readonly string[] = []) => [
'exec', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules', '-s', 'read-only', '-c', 'model_reasoning_effort=low',
    ...pictures.map((p) => `--image=${p}`), prompt],
};
