// OPENCODE'S OWN TRANSPORT, AND WHY IT IS THE SERVER AND NOT THE CLI.
//
// Measured against a real OpenCode 1.18.35 on 2026-10-07. `opencode run` is
// the obvious road -- it is non-interactive, `--format json` prints one JSON
// object per line, and that is nearly the shape main/harnesses/claude-stream
// already reads. It is also the wrong road, and the measurement says so in one
// line. Run with `permission: { bash: "ask" }` in config, the CLI printed:
//
//   ! permission requested: bash (echo probe-run-mode); auto-rejecting
//
// and handed the model "The user rejected permission to use this specific tool
// call." With no permission config at all it ran the command with no card.
// `--auto` approves everything not explicitly denied. So the CLI offers
// approve-everything or refuse-everything, and an Agentbox card is neither.
//
// The HTTP server does carry a real approval. `opencode serve` raises
// `permission.asked` on its `/event` stream with the command in
// `metadata.command`, and `POST /session/:id/permissions/:id` with
// `{ response: "once" }` releases it while `{ response: "reject" }` refuses it.
// Both measured end to end against the real binary, both answers, 200 each
// time, the tool running in the first case and coming back
// "The user rejected permission to use this specific tool call." in the second.
// That is the same card contract main/codex-approvals.mjs already fills, which
// is why this file exists and a second stream parser does not.
//
// AND IT IS WHY WE DO NOT PASS `--auto` ANYWHERE. A grep for it is a test
// (tests/opencode-asks-before-it-runs-a-command), because the flag would make
// every run quietly approve its own file writes and shell commands.
import { EventEmitter } from 'node:events';
import { Name } from '../shared/product-name.mjs';

/** How long a single HTTP call to the local server may take. */
const CALL_MS = 60_000;

/**
 * A client for one `opencode serve`.
 *
 * `password` is the server's own basic-auth secret, which Agentbox generates
 * per server and which OpenCode reads from `OPENCODE_SERVER_PASSWORD`. It is
 * NOT a provider credential: OpenCode loads those itself, from its own
 * `~/.local/share/opencode/auth.json`. Agentbox never has one to pass, which
 * is the rule in CLAUDE.md and the reason this harness can exist at all.
 */
export function openCodeClient({ baseUrl, password = null, username = 'opencode', fetchImpl = globalThis.fetch } = {}) {
  if (!baseUrl) throw Error('openCodeClient needs the address of a running OpenCode server');
  const root = String(baseUrl).replace(/\/+$/, '');
  const authorization = password ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` : null;

  const request = async (path, { method = 'GET', body, signal, stream = false } = {}) => {
    const response = await fetchImpl(root + path, {
      method,
      headers: {
        ...(authorization ? { authorization } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(stream ? { accept: 'text/event-stream' } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal ?? AbortSignal.timeout(CALL_MS),
    });
    if (!response.ok) throw Error(`OpenCode answered ${response.status} for ${method} ${path}`);
    if (stream) return response;
    const text = await response.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  };

  return {
    url: root,
    request,
    createSession: (body = {}) => request('/session', { method: 'POST', body }),
    prompt: (sessionId, body) => request(`/session/${encodeURIComponent(sessionId)}/prompt_async`, { method: 'POST', body }),
    abort: sessionId => request(`/session/${encodeURIComponent(sessionId)}/abort`, { method: 'POST', body: {} }),
    // `{ response }` and not `{ action }`: the field name is off the real
    // OpenAPI document the running server serves at /doc.
    replyPermission: (sessionId, permissionId, response) =>
      request(`/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`, { method: 'POST', body: { response } }),
    summarize: (sessionId, model) =>
      request(`/session/${encodeURIComponent(sessionId)}/summarize`, { method: 'POST', body: splitModel(model) }),
    runCommand: (sessionId, body) => request(`/session/${encodeURIComponent(sessionId)}/command`, { method: 'POST', body }),
    providers: () => request('/config/providers'),
    commands: () => request('/command'),
    config: () => request('/config'),
    health: () => request('/global/health'),
    events: ({ signal } = {}) => eventStream(request, signal),
  };
}

/**
 * `provider/model` as the two fields OpenCode's API wants.
 *
 * Its model ids are provider-qualified and the slash is part of the id people
 * see (`opencode/big-pickle`, `anthropic/claude-sonnet-4-5`), but every server
 * endpoint takes `providerID` and `modelID` apart. A model with no slash is not
 * guessed at: it is left for the server's own default to answer, because
 * inventing a provider here is how a run dies on a model nobody chose.
 */
export function splitModel(model) {
  const text = typeof model === 'string' ? model.trim() : '';
  const at = text.indexOf('/');
  if (at <= 0 || at === text.length - 1) return {};
  return { providerID: text.slice(0, at), modelID: text.slice(at + 1) };
}

/** The `/event` stream, as an async iterable of `{ type, properties }`. */
function eventStream(request, outerSignal) {
  const controller = new AbortController();
  outerSignal?.addEventListener('abort', () => controller.abort(), { once: true });
  const opened = request('/event', { stream: true, signal: controller.signal });

  return {
    close: () => controller.abort(),
    async *[Symbol.asyncIterator]() {
      const response = await opened;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          let index;
          while ((index = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 1);
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try { yield JSON.parse(payload); } catch { /* a half-written frame is not news */ }
          }
        }
      } finally {
        try { await reader.cancel(); } catch { /* already gone */ }
      }
    },
  };
}

/** The permission events, old and new, that mean "a card is wanted". */
const ASKED = new Set(['permission.asked', 'permission.v2.asked']);
/** What the reply endpoint calls yes and no. */
const ALLOW = 'once';
const DENY = 'reject';

/**
 * ONE OPENCODE RUN, SHAPED LIKE A CHILD PROCESS.
 *
 * The supervisor's spawn path wants something with `stderr`, `on('event')` and
 * one `exit`, because that is what a Claude Code child and a Codex worker both
 * look like from there (main/supervisor.mjs, `_spawnWorker`). This is the third
 * one, and it owns nothing the other two own: its events are OpenCode's own
 * names, passed through untranslated, exactly as the Codex adapter passes its
 * notifications through rather than pretending to be Claude's JSON lines.
 *
 * DENY IS THE ANSWER NOBODY HAS TO CHOOSE. A card that is never answered, a
 * handler that throws, a spool that has gone away, a worker killed mid-question
 * -- every one of those refuses the tool call. The opposite default would mean
 * a crashed inbox silently approves shell commands, which is the one failure
 * here that cannot be taken back.
 */
export function createOpenCodeWorker({
  client,
  plan = {},
  cwd = null,
  resumeSessionId = null,
  onApproval = null,
  title = null,
} = {}) {
  if (!client) throw Error('createOpenCodeWorker needs a client for a running OpenCode server');

  const worker = new EventEmitter();
  worker.stderr = new EventEmitter();
  worker.stdout = new EventEmitter();
  worker.sessionId = resumeSessionId ?? null;

  const say = text => {
    const line = String(text ?? '').trim();
    if (line) worker.stderr.emit('data', line);
  };

  let ended = false;
  let stream = null;
  const answered = new Set();

  const stop = async () => {
    if (ended) return;
    ended = true;
    try { stream?.close(); } catch { /* already closed */ }
    if (worker.sessionId) { try { await client.abort(worker.sessionId); } catch { /* the run is over either way */ } }
  };

  /**
   * One card, and the reply that releases or refuses the tool.
   *
   * The id is remembered BEFORE the card is raised, so a request the stream
   * repeats -- which it does, `permission.asked` can arrive again for a request
   * still open -- costs one card and not two.
   */
  const decide = async (type, properties) => {
    const id = properties?.id;
    const session = properties?.sessionID;
    if (!id || session !== worker.sessionId || answered.has(id)) return;
    answered.add(id);

    let allowed = false;
    try {
      allowed = onApproval ? await onApproval(type, properties) === true : false;
    } catch (error) {
      say(`${Name} could not ask about ${String(properties?.metadata?.command ?? 'a tool call')}: ${error?.message ?? error}`);
      allowed = false;
    }
    if (ended) allowed = false;

    try {
      await client.replyPermission(session, id, allowed ? ALLOW : DENY);
    } catch (error) {
      say(`OpenCode did not take the answer to that question: ${error?.message ?? error}`);
    }
  };

  const run = async () => {
    try {
      if (!worker.sessionId) {
        const session = await client.createSession({ ...(title ? { title } : {}), ...(cwd ? { directory: cwd } : {}) });
        worker.sessionId = session?.id ?? null;
        if (!worker.sessionId) throw Error('OpenCode did not name the session it opened');
      }

      // The stream is opened BEFORE the prompt. Opening it after is a race the
      // fast answers win: `permission.asked` for the first tool call can beat
      // our own subscription, and nothing would ever answer that card.
      stream = client.events();
      const reading = (async () => {
        for await (const event of stream) {
          if (ended) return;
          const type = String(event?.type ?? '');
          const properties = event?.properties ?? {};
          worker.emit('event', type, properties);
          if (ASKED.has(type)) { await decide(type, properties); continue; }
          if (properties?.sessionID && properties.sessionID !== worker.sessionId) continue;
          if (type === 'session.error') {
            worker.error = properties?.error ?? 'OpenCode reported an error';
            return;
          }
          if (type === 'session.idle') return;
        }
      })();

      await client.prompt(worker.sessionId, {
        ...splitModel(plan.model),
        ...(plan.agent ? { agent: plan.agent } : {}),
        parts: [{ type: 'text', text: String(plan.prompt ?? '') }],
      });

      await reading;
    } catch (error) {
      worker.error = error?.message ?? String(error);
      say(worker.error);
    } finally {
      const already = ended;
      ended = true;
      try { stream?.close(); } catch { /* already closed */ }
      if (!already && worker.sessionId) { try { await client.abort(worker.sessionId); } catch { /* nothing left to stop */ } }
      worker.emit('exit', worker.error ? 1 : 0, null);
    }
  };

  worker.kill = () => { void stop(); };
  worker.done = run();
  return worker;
}
