// A MODEL BEHIND THE REAL CLAUDE CODE, SO A WHOLE TASK RUNS WITHOUT A LOGIN OR A BILL.
//
// WHY THIS EXISTS. Most of the bugs that reached people were about their own
// machines: how Claude Code was installed, what was in their ~/.claude, which
// hooks and connected tools they had, which version they were on. The fake
// Macs could only ask "is it found, does `--version` run?", because a real
// task needed a real login, and a real login is somebody's subscription. The
// stand-in worker (scripts/lib/stub-claude-worker.mjs) runs every task, but it
// is not Claude Code, so none of Claude Code's own reading of a person's
// settings ever happened in a test.
//
// WHAT WAS MEASURED, on this Mac 2026-10-15, Claude Code 2.1.301. A HOME with
// nothing in it but `~/.claude/settings.json` carrying
//
//   { "env": { "ANTHROPIC_BASE_URL": "http://127.0.0.1:<port>",
//              "ANTHROPIC_AUTH_TOKEN": "stub" } }
//
// is enough: signed out, `claude -p` posts `/v1/messages?beta=true` here with
// `stream: true`, runs the turn, writes its session under
// `~/.claude/projects/<cwd>/<id>.jsonl`, and exits 0. Nothing reaches Anthropic
// and nothing is billed. The address rides in that person's own settings file,
// which is a place Claude Code reads for itself, so Agentbox's rule that a
// worker is never handed an API key in its environment stays exactly as it is.
//
// The model obeys the same words the stand-in worker and the Codex stand-in
// obey, so a drive can tell whose answer is whose:
//
//   [[tok:abc]]         answer with "abc"
//   [[stub:slow:4000]]  take 4 s
//   [[stub:hang]]       never answer
//   [[stub:limit]]      refuse as a plan out of usage does (HTTP 429)
//
// and with no word it answers the way a model asked for one word would: it
// finds "reply with exactly the word X" (or, on a later turn, the word it said
// before) and says X. That is what lets the drives written for the real
// subscription run here unchanged.
import http from 'node:http';

/**
 * Every user message's text, oldest first. Claude Code adds blocks of its own
 * to a user message (reminders, a hook's added context), and those are not
 * what the person typed, so they are left out.
 */
export function userTexts(body) {
  const out = [];
  const typed = (t) => !/^\s*<(system-reminder|command-|local-command)/.test(String(t));
  for (const m of body?.messages ?? []) {
    if (m.role !== 'user') continue;
    if (typeof m.content === 'string') { if (typed(m.content)) out.push(m.content); continue; }
    for (const c of m.content ?? []) if (c?.type === 'text' && typed(c.text)) out.push(c.text);
  }
  return out;
}
/** Every assistant message's text, oldest first. */
export function assistantTexts(body) {
  const out = [];
  for (const m of body?.messages ?? []) {
    if (m.role !== 'assistant') continue;
    if (typeof m.content === 'string') { out.push(m.content); continue; }
    for (const c of m.content ?? []) if (c?.type === 'text') out.push(c.text);
  }
  return out;
}
const lastOf = (a) => a[a.length - 1] ?? '';

/**
 * Claude Code asks for more than the task: a title for the session, a check
 * that the key works, a summary. Those go out with no tools and a short
 * system prompt; the task's own turn carries Claude Code's tool table. Only
 * that turn is the one a drive is about, and only it is logged as "asked".
 */
export const isTaskTurn = (body) => Array.isArray(body?.tools) && body.tools.length > 0;

/** What a model asked "reply with exactly the word X" says, and what it remembers. */
export function defaultAnswer(body) {
  const said = userTexts(body).join('\n');
  const tok = lastOf([...said.matchAll(/\[\[tok:([^\]]+)\]\]/g)].map((m) => m[1]));
  const mark = tok ? ` [${tok}]` : '';
  if (/which word did you just reply with/i.test(lastOf(userTexts(body)))) {
    // A model remembers only what it was sent. Its own earlier answer is the
    // first place to look (a resumed session); failing that, a re-briefed
    // prompt that carries the thread still tells it. With neither, there is
    // nothing to remember, and it says so rather than guessing right.
    const before = assistantTexts(body).join('\n').match(/\b([A-Z]{3,})\b/)?.[1]
      ?? userTexts(body).slice(0, -1).join('\n').match(/reply with exactly the word ([A-Za-z]+)/i)?.[1];
    return before ?? 'I do not know.';
  }
  const word = lastOf([...said.matchAll(/reply with exactly the word ([A-Za-z]+)/gi)].map((m) => m[1]));
  if (word) return `${word}${mark}`;
  return `The Claude stand-in model answered.${mark}`;
}

/** The token every stand-in home signs with. Not a key: it opens nothing anywhere. */
export const STUB_TOKEN = 'stub-not-a-key';

/**
 * HOW A REQUEST WAS SIGNED, without the secret. A key a person left in their
 * settings is billed to them per call; the stand-in's own token is not a key.
 * So a check can tell "this setup would have billed somebody's API key" from
 * the request alone: 'api-key' is x-api-key, 'bearer' is any other bearer
 * token, 'stub' is ours, 'none' is unsigned.
 */
export function authOf(headers = {}) {
  if (headers['x-api-key']) return 'api-key';
  const bearer = String(headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return 'none';
  return bearer === STUB_TOKEN ? 'stub' : 'bearer';
}

/**
 * One HTTP server speaking the slice of the Messages API Claude Code uses.
 * `respond(body, ctx)` returns the answer's text, or `{ status, message }` to
 * refuse. Each request is kept, whole, in `requests`, because the request is
 * evidence: what Claude Code sent tells a check which tools, which system
 * prompt and which conversation a person's setup produced.
 */
export function createClaudeStubModel({ respond = defaultAnswer, onRequest = null } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      let body = null;
      try { body = JSON.parse(raw); } catch { body = null; }
      const turn = { at: Date.now(), method: req.method, url: req.url, body, auth: authOf(req.headers) };
      requests.push(turn);
      onRequest?.(turn);
      if (!/^\/v1\/messages(\?|$)/.test(req.url)) {
        // count_tokens and anything else Claude Code checks on the side: an
        // answer that keeps it going and says nothing.
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(/count_tokens/.test(req.url) ? { input_tokens: 1 } : {}));
        return;
      }
      let answer;
      try {
        answer = await respond(body, { requests, index: requests.length - 1 });
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: `stub model threw: ${err?.message ?? err}` } }));
        return;
      }
      if (answer && typeof answer === 'object' && answer.status) {
        res.writeHead(answer.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: answer.kind ?? 'rate_limit_error', message: answer.message ?? 'refused' } }));
        return;
      }
      // `{ toolUse: { name, input } }` asks Claude Code to run one tool; the
      // next request carries its result. Anything else is the answer's text.
      const tool = answer && typeof answer === 'object' && answer.toolUse
        ? { type: 'tool_use', id: `toolu_stub_${requests.length}`, name: answer.toolUse.name, input: answer.toolUse.input ?? {} }
        : null;
      const text = tool ? '' : String(answer ?? '');
      const stop = tool ? 'tool_use' : 'end_turn';
      const id = `msg_stub_${requests.length}`;
      const model = body?.model ?? 'claude-stub';
      const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
      if (!body?.stream) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id, type: 'message', role: 'assistant', model, content: [tool ?? { type: 'text', text }], stop_reason: stop, stop_sequence: null, usage }));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
      send('message_start', { message: { id, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage } });
      if (tool) {
        send('content_block_start', { index: 0, content_block: { ...tool, input: {} } });
        send('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(tool.input) } });
      } else {
        send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
        send('content_block_delta', { index: 0, delta: { type: 'text_delta', text } });
      }
      send('content_block_stop', { index: 0 });
      send('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 1 } });
      send('message_stop', {});
      res.end();
    });
  });
  return {
    requests,
    listen: (port = 0) => new Promise((resolve) => {
      server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
    }),
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}

/** The settings that point a Claude Code home at this model. Merged over whatever the home already has. */
export function stubClaudeSettings(url, settings = {}) {
  return { ...settings, env: { ...(settings.env ?? {}), ANTHROPIC_BASE_URL: url, ANTHROPIC_AUTH_TOKEN: STUB_TOKEN, DISABLE_AUTOUPDATER: '1' } };
}
