// THE OPENCODE ADAPTER, AND IT IS THE POINT OF THE ENGINE ROW.
//
// The engine proposal (w-380b06bf53) counted 96 `=== 'codex'` or
// `=== 'claude'` branch points across 12 files and claimed one interface would
// turn the next harness into one new module. This is the test of that claim,
// and the answer is nearly yes: OpenCode is this file, main/opencode.mts,
// main/opencode-server.mts, one entry of data in shared/harness-definitions,
// one line registering it in main/harnesses.mts -- and one filter in
// shared/engines.mjs, which was NOT free and is written up there. No existing
// file grew an engine branch.
//
// WHAT IS DECLARED MISSING RATHER THAN FAKED. `usage` is absent, so the
// registry answers `{ supported: false }` for it: OpenCode bills through
// whichever provider the user connected and has no endpoint that reports a
// plan limit. Per-run tokens and cost do arrive and are read
// (main/opencode.mts), but "what is left" is a question nothing can answer, and
// docs/harnesses.md says never to mark missing usage as zero. `attachInput` is
// absent too: there is a `/tui/append-prompt` endpoint but it drives the
// terminal UI, not a headless run, so remoteControl is false.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { harnessDefinition } from '../../shared/harness-definitions.mjs';
import { openCodeClient, createOpenCodeWorker, splitModel } from '../opencode-server.mts';
import type { OpenCodeClient, OpenCodePlan, OpenCodeWorker } from '../opencode-server.mts';
import {
  captureOpenCodeEvent, openCodeStreamingText, summarizeOpenCodeEvent,
  traceOpenCodeEvent, openCodeActivity, rememberOpenCodeProsePart,
  openCodePermissionConfig,
} from '../opencode.mts';
import { definitionMethods, commonUpdatePlan } from './common.mts';
import type { BinKey, Env, HarnessConfig, HarnessPlan, HarnessSession, HarnessSpawnContext, HarnessSupervisor, SignInFilesWhere, UpdatePlanOptions } from './common.mts';

const definition = harnessDefinition('opencode')!;

/**
 * WHERE THIS WORKER'S PERMISSION POLICY LIVES ON DISK.
 *
 * One file per task folder, inside the folder, so two workers cannot read each
 * other's policy and nothing is written into the user's own OpenCode config.
 * `OPENCODE_CONFIG` points at it. It is rewritten on every start rather than
 * reused, because a stale one is how a run silently stops asking.
 */
export function writePermissionConfig(cwd: string): string {
  const file = path.join(cwd, '.agentbox-opencode.json');
  fs.writeFileSync(file, `${JSON.stringify(openCodePermissionConfig(), null, 2)}\n`, 'utf8');
  return file;
}

/** The models OpenCode itself says are available, as `provider/model` rows. */
export interface OpenCodeProviderList {
  providers?: { id: string; name?: string; models?: Record<string, { name?: string } | null> }[];
}

export function openCodeModelRows(providers: OpenCodeProviderList | null | undefined): { id: string; label: string }[] {
  const list = Array.isArray(providers?.providers) ? providers.providers : [];
  const rows: { id: string; label: string }[] = [];
  for (const provider of list) {
    for (const [id, model] of Object.entries(provider?.models ?? {})) {
      rows.push({ id: `${provider.id}/${id}`, label: `${provider.name ?? provider.id} · ${model?.name ?? id}` });
    }
  }
  return rows;
}

export const openCodeHarness = {
  ...definitionMethods(definition),

  // BINARY DISCOVERY. No bespoke resolver: the binary is whatever the config
  // names, the same question `common.mts` answers for the other two.
  discover: (config: HarnessConfig | null = {}) => config?.[definition.binKey as BinKey] ?? null,

  // SIGN-IN. `opencode auth login` writes to OpenCode's own store and
  // `opencode auth list` reports it. Agentbox launches those two and reads
  // neither file, which is the whole of its involvement with credentials.
  //
  // AND SIGNED IN IS NOT REQUIRED. The other two harnesses cannot run without
  // a login; OpenCode can, on the Zen free tier (measured: zero credentials,
  // ten models, a finished run at cost 0). So this answers true rather than
  // gating the run, and a provider that does need a key fails loudly at
  // `session.error` with its own words, which the readers surface.
  signedIn: () => true,
  profiles: () => ['default'],
  profileHome: () => null,

  // THE WORKER'S ENVIRONMENT. `profileEnv` points OPENCODE_CONFIG at the
  // policy file written for this folder; `workerEnv` (from the definition)
  // strips every provider key first, so nothing we hold can reach it.
  profileEnv: (env: Env, profile: string) => (profile && profile !== 'default' ? { ...env, [definition.homeEnv]: profile } : env),
  accountKey: () => `${definition.accountPrefix}default`,
  signInFiles: ({ folder, home }: SignInFilesWhere) => (folder
    ? definition.credentialFiles.map((file: string) => path.join(folder, file))
    : [path.join(home, '.local/share/opencode/auth.json')]),

  // MODELS. Asked of the running server rather than kept in a list here, for
  // the reason Conductor's own docs give for doing the same: the set depends
  // entirely on what the user connected, and we do not know it.
  async models({ client }: { client?: OpenCodeClient } = {}) {
    if (!client) return { supported: false, engine: definition.id, capability: 'models' };
    try { return openCodeModelRows(await client.providers() as OpenCodeProviderList); }
    catch { return { supported: false, engine: definition.id, capability: 'models' }; }
  },
  defaultModel: () => null,
  workspaceModel: () => null,
  effortLevels: () => ({ supported: false, engine: definition.id, capability: 'effortLevels' }),

  tooling: () => null,

  /**
   * ONE RUN. A server for this folder, then a worker on a session in it.
   *
   * The server is started per folder and killed with the worker. `--port 0`
   * is not used: OpenCode picks a random port when none is given and prints
   * the address it chose, which is what `openCodeServerAddress` waits for.
   */
  spawn(sup: HarnessSupervisor, plan: HarnessPlan & OpenCodePlan, { cwd, item, profile = 'default', env }: HarnessSpawnContext) {
    const configFile = writePermissionConfig(cwd);
    const password = sup._openCodePassword?.() ?? null;
    const server = spawn(sup.config[definition.binKey as BinKey]!, ['serve', '--hostname', '127.0.0.1', '--port', '0'], {
      cwd,
      env: {
        ...env,
        [definition.homeEnv]: configFile,
        ...(password ? { OPENCODE_SERVER_PASSWORD: password } : {}),
        ZERO_PRODUCT: item.product, ZERO_ITEM: item.id,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const worker: OpenCodeWorker & { server?: ChildProcess } = createOpenCodeWorker({
      client: openCodeServerClient(server, password),
      plan,
      cwd,
      resumeSessionId: plan.resumeId ?? null,
      title: item.id,
      onApproval: sup._openCodeApprovals?.(item) ?? null,
    });
    worker.once('exit', () => { try { server.kill(); } catch { /* already gone */ } });
    worker.server = server;
    return worker;
  },

  readers: () => ({
    capture: captureOpenCodeEvent,
    stream: openCodeStreamingText,
    summarize: summarizeOpenCodeEvent,
    trace: traceOpenCodeEvent,
    activity: openCodeActivity,
  }),

  // Native names through, untranslated, as the Codex adapter does. The prose
  // part is remembered first so a reasoning delta is never streamed as prose.
  subscribe(child: OpenCodeWorker, session: HarnessSession, absorb: (type: string, properties: unknown) => void): void {
    child.on('event', (type: string, properties: Parameters<typeof rememberOpenCodeProsePart>[2]) => {
      rememberOpenCodeProsePart(session, type, properties);
      absorb(type, properties);
    });
  },

  transcript: () => null,
  change: (session: HarnessSession | null | undefined) => (session?.opencodeChange?.length ? { files: [...session.opencodeChange] } : null),
  release: () => {},

  // COMPACTION. `POST /session/:id/summarize` -- measured, returns true.
  compact: (sup: HarnessSupervisor, rec: { sessionId?: string; client?: OpenCodeClient; model?: string | null } | null | undefined) => (rec?.sessionId && rec.client
    ? rec.client.summarize(rec.sessionId, rec.model ?? null)
    : Promise.resolve(false)),

  // SLASH COMMANDS. `GET /command` lists them and
  // `POST /session/:id/command` runs one, both first-party.
  runCommand: (sup: HarnessSupervisor, { client, sessionId, name, args = '' }: { client?: OpenCodeClient; sessionId?: string; name?: string; args?: string } = {}) => (client && sessionId
    ? client.runCommand(sessionId, { command: name, arguments: args })
    : Promise.resolve(null)),

  // VERSION UPDATES. `opencode upgrade` is its own updater and knows how it
  // was installed; brew and npm installs are still caught by the common plan
  // first so the user's package manager stays in charge where it is the owner.
  updatePlan: (options: UpdatePlanOptions) => commonUpdatePlan(definition, options, ({ bin, real, name }) => (
    path.isAbsolute(bin) && real
      ? { name, file: bin, args: ['upgrade'], feed: 'https://api.github.com/repos/sst/opencode/releases/latest', format: 'text' }
      : null)),
  updateSettings: () => ({}),

  smallModelArgs: (prompt: string, model?: string | null) => ['run', '--format', 'json', ...(model ? ['--model', model] : []), prompt],
  memoryGate: () => ({}),
};

type ClientMethod = (...args: unknown[]) => Promise<unknown>;
type ClientEvents = ((options?: { signal?: AbortSignal }) => AsyncIterable<unknown> & { close(): void }) & { close?: () => void };
interface ClientParts {
  events: ClientEvents;
  [method: string]: ClientMethod | ClientEvents;
}

/** A client bound to a server whose port is only known once it says so. */
export function openCodeServerClient(server: ChildProcess, password: string | null = null): OpenCodeClient {
  const address = openCodeServerAddress(server, { password });
  const bind = (method: string) => async (...args: unknown[]) => {
    const client = await address as unknown as Record<string, ClientMethod>;
    return client[method](...args);
  };
  const client = {} as ClientParts;
  for (const method of ['createSession', 'prompt', 'abort', 'replyPermission', 'summarize', 'runCommand', 'providers', 'commands', 'config', 'health']) {
    client[method] = bind(method);
  }
  client.events = ({ signal }: { signal?: AbortSignal } = {}) => ({
    close: () => {},
    async *[Symbol.asyncIterator]() {
      const real = await address;
      const stream = real.events({ signal });
      client.events.close = () => stream.close();
      yield* stream;
    },
  });
  return client as unknown as OpenCodeClient;
}

/**
 * THE ADDRESS THE SERVER CHOSE, READ OFF ITS OWN FIRST LINE.
 *
 * `opencode serve` prints "opencode server listening on http://127.0.0.1:PORT"
 * and nothing else before it is ready -- measured. Asking for port 0 and
 * reading the answer is how two workers on one Mac never collide, which
 * guessing a port does not survive.
 */
export function openCodeServerAddress(server: ChildProcess, { password = null, timeoutMs = 30_000 }: { password?: string | null; timeoutMs?: number } = {}): Promise<OpenCodeClient> {
  return new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(Error('OpenCode did not say which port it was listening on')), timeoutMs);
    const done = (outcome: () => void) => {
      clearTimeout(timer);
      server.stdout?.off?.('data', look);
      server.stderr?.off?.('data', look);
      outcome();
    };
    const look = (data: Buffer | string) => {
      text += data.toString();
      const found = text.match(/https?:\/\/[0-9.]+:\d+/);
      if (found) done(() => resolve(openCodeClient({ baseUrl: found[0], password })));
    };
    server.stdout?.on?.('data', look);
    server.stderr?.on?.('data', look);
    server.once('exit', (code: number | null) => done(
() => reject(Error(`OpenCode's server stopped before it was ready (${code})`))));
  });
}

export { splitModel };
