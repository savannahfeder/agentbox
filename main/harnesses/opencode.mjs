// THE OPENCODE ADAPTER, AND IT IS THE POINT OF THE ENGINE ROW.
//
// The engine proposal (w-380b06bf53) counted 96 `=== 'codex'` or
// `=== 'claude'` branch points across 12 files and claimed one interface would
// turn the next harness into one new module. This is the test of that claim,
// and the answer is nearly yes: OpenCode is this file, main/opencode.mjs,
// main/opencode-server.mjs, one entry of data in shared/harness-definitions,
// one line registering it in main/harnesses.mjs -- and one filter in
// shared/engines.mjs, which was NOT free and is written up there. No existing
// file grew an engine branch.
//
// WHAT IS DECLARED MISSING RATHER THAN FAKED. `usage` is absent, so the
// registry answers `{ supported: false }` for it: OpenCode bills through
// whichever provider the user connected and has no endpoint that reports a
// plan limit. Per-run tokens and cost do arrive and are read
// (main/opencode.mjs), but "what is left" is a question nothing can answer, and
// docs/harnesses.md says never to mark missing usage as zero. `attachInput` is
// absent too: there is a `/tui/append-prompt` endpoint but it drives the
// terminal UI, not a headless run, so remoteControl is false.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { harnessDefinition } from '../../shared/harness-definitions.mjs';
import { openCodeClient, createOpenCodeWorker, splitModel } from '../opencode-server.mjs';
import {
  captureOpenCodeEvent, openCodeStreamingText, summarizeOpenCodeEvent,
  traceOpenCodeEvent, openCodeActivity, rememberOpenCodeProsePart,
  openCodePermissionConfig,
} from '../opencode.mjs';
import { definitionMethods, commonUpdatePlan } from './common.mjs';

const definition = harnessDefinition('opencode');

/**
 * WHERE THIS WORKER'S PERMISSION POLICY LIVES ON DISK.
 *
 * One file per task folder, inside the folder, so two workers cannot read each
 * other's policy and nothing is written into the user's own OpenCode config.
 * `OPENCODE_CONFIG` points at it. It is rewritten on every start rather than
 * reused, because a stale one is how a run silently stops asking.
 */
export function writePermissionConfig(cwd) {
  const file = path.join(cwd, '.agentbox-opencode.json');
  fs.writeFileSync(file, `${JSON.stringify(openCodePermissionConfig(), null, 2)}\n`, 'utf8');
  return file;
}

/** The models OpenCode itself says are available, as `provider/model` rows. */
export function openCodeModelRows(providers) {
  const list = Array.isArray(providers?.providers) ? providers.providers : [];
  const rows = [];
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
  // names, the same question `common.mjs` answers for the other two.
  discover: (config = {}) => config?.[definition.binKey] ?? null,

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
  profileEnv: (env, profile) => (profile && profile !== 'default' ? { ...env, [definition.homeEnv]: profile } : env),
  accountKey: () => `${definition.accountPrefix}default`,
  signInFiles: ({ folder, home }) => (folder
    ? definition.credentialFiles.map(file => path.join(folder, file))
    : [path.join(home, '.local/share/opencode/auth.json')]),

  // MODELS. Asked of the running server rather than kept in a list here, for
  // the reason Conductor's own docs give for doing the same: the set depends
  // entirely on what the user connected, and we do not know it.
  async models({ client } = {}) {
    if (!client) return { supported: false, engine: definition.id, capability: 'models' };
    try { return openCodeModelRows(await client.providers()); }
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
  spawn(sup, plan, { cwd, item, profile = 'default', env }) {
    const configFile = writePermissionConfig(cwd);
    const password = sup._openCodePassword?.() ?? null;
    const server = spawn(sup.config[definition.binKey], ['serve', '--hostname', '127.0.0.1', '--port', '0'], {
      cwd,
      env: {
        ...env,
        [definition.homeEnv]: configFile,
        ...(password ? { OPENCODE_SERVER_PASSWORD: password } : {}),
        ZERO_PRODUCT: item.product, ZERO_ITEM: item.id,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const worker = createOpenCodeWorker({
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
  subscribe(child, session, absorb) {
    child.on('event', (type, properties) => {
      rememberOpenCodeProsePart(session, type, properties);
      absorb(type, properties);
    });
  },

  transcript: () => null,
  change: session => (session?.opencodeChange?.length ? { files: [...session.opencodeChange] } : null),
  release: () => {},

  // COMPACTION. `POST /session/:id/summarize` -- measured, returns true.
  compact: (sup, rec) => (rec?.sessionId && rec.client
    ? rec.client.summarize(rec.sessionId, rec.model ?? null)
    : Promise.resolve(false)),

  // SLASH COMMANDS. `GET /command` lists them and
  // `POST /session/:id/command` runs one, both first-party.
  runCommand: (sup, { client, sessionId, name, args = '' } = {}) => (client && sessionId
    ? client.runCommand(sessionId, { command: name, arguments: args })
    : Promise.resolve(null)),

  // VERSION UPDATES. `opencode upgrade` is its own updater and knows how it
  // was installed; brew and npm installs are still caught by the common plan
  // first so the user's package manager stays in charge where it is the owner.
  updatePlan: options => commonUpdatePlan(definition, options, ({ bin, real, name }) => (
    path.isAbsolute(bin) && real
      ? { name, file: bin, args: ['upgrade'], feed: 'https://api.github.com/repos/sst/opencode/releases/latest', format: 'text' }
      : null)),
  updateSettings: () => ({}),

  smallModelArgs: (prompt, model) => ['run', '--format', 'json', ...(model ? ['--model', model] : []), prompt],
  memoryGate: () => ({}),
};

/** A client bound to a server whose port is only known once it says so. */
export function openCodeServerClient(server, password = null) {
  const address = openCodeServerAddress(server, { password });
  const bind = method => async (...args) => {
    const client = await address;
    return client[method](...args);
  };
  const client = {};
  for (const method of ['createSession', 'prompt', 'abort', 'replyPermission', 'summarize', 'runCommand', 'providers', 'commands', 'config', 'health']) {
    client[method] = bind(method);
  }
  client.events = ({ signal } = {}) => ({
    close: () => {},
    async *[Symbol.asyncIterator]() {
      const real = await address;
      const stream = real.events({ signal });
      client.events.close = () => stream.close();
      yield* stream;
    },
  });
  return client;
}

/**
 * THE ADDRESS THE SERVER CHOSE, READ OFF ITS OWN FIRST LINE.
 *
 * `opencode serve` prints "opencode server listening on http://127.0.0.1:PORT"
 * and nothing else before it is ready -- measured. Asking for port 0 and
 * reading the answer is how two workers on one Mac never collide, which
 * guessing a port does not survive.
 */
export function openCodeServerAddress(server, { password = null, timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(Error('OpenCode did not say which port it was listening on')), timeoutMs);
    const done = outcome => {
      clearTimeout(timer);
      server.stdout?.off?.('data', look);
      server.stderr?.off?.('data', look);
      outcome();
    };
    const look = data => {
      text += data.toString();
      const found = text.match(/https?:\/\/[0-9.]+:\d+/);
      if (found) done(() => resolve(openCodeClient({ baseUrl: found[0], password })));
    };
    server.stdout?.on?.('data', look);
    server.stderr?.on?.('data', look);
    server.once('exit', code => done(() => reject(Error(`OpenCode's server stopped before it was ready (${code})`))));
  });
}

export { splitModel };
