// A CODEX THAT ANSWERS FROM A SCRIPT, SO THE HARNESS CAN BE WITNESSED WITHOUT
// SPENDING A SUBSCRIPTION OR TOUCHING THE FOUNDER'S ~/.codex.
//
// WHY THIS EXISTS. The proof scripts beside it have to drive the REAL shipping
// modules against the REAL `codex` binary -- main/codex-app-server.mjs,
// main/codex-session.mjs, main/codex-approvals.mjs and the supervisor's own
// spawn path -- and they have to do it repeatably, on demand, in a way that
// asks the same question twice and gets the same answer. Two things were in the
// way, and both are solved here rather than argued around:
//
//   AUTH. `codex app-server` with a scratch CODEX_HOME is signed out, and every
//   turn on it dies at 401 before it ever reaches a tool call. Pointing it at
//   the real `~/.codex` is the only other way to get a model, and that reads and
//   rewrites a person's `auth.json` and leaves rollouts in their home.
//
// DETERMINISM. is not a thing a real model can be asked for reliably. It either
// runs the command you wanted or it reasons its way to a different one, and a
// proof that passes four times in five is not a proof.
//
// WHAT WAS MEASURED, on this Mac 2026-09-07, codex-cli 0.148.0. A provider in
// CODEX_HOME's own config.toml is enough to move the model somewhere else:
//
//   [model_providers.stub] base_url = "http://127.0.0.1:<port>/v1"
//   wire_api = "responses"   env_key = "STUB_KEY"
//
//   -> codex POSTs `/v1/responses` with `stream: true`, `store: false`, and its
//      whole real tool table: exec_command, write_stdin, update_plan,
//      request_user_input, view_image, the multi_agent_v1 namespace, get_goal,
//      create_goal, update_goal and web_search. Answering with two SSE frames --
//      one `response.output_item.done` carrying a `function_call` for
//      `exec_command`, then `response.completed` -- ran the command for real:
//      `/bin/zsh -lc 'echo stub-ran > STUBMARK'` and STUBMARK was on disk.
//
// `wire_api = "chat"` IS REFUSED OUTRIGHT by 0.148, so `responses` is not a
// preference here, it is the only shape that loads.
//
// WHAT THIS IS AND IS NOT. Everything between Agentbox and the command that runs
// is real: the binary, the JSON-RPC protocol, the sandbox, the approval
// requests, the rollout on disk, and every module in this repo. The only thing
// standing in for itself is the language model, which is exactly the part these
// proofs are not about. Where a scenario genuinely needs a model's judgement,
// this is the wrong tool and the script should say so rather than pretend.
//
// The requests are kept, whole, because they are evidence: the resume proof
// reads the SECOND turn's request body to show that the conversation Codex sent
// back to the model still carried the first turn's messages.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

/**
 * One HTTP server speaking the slice of the Responses API that codex-cli 0.148
 * actually uses.
 *
 * `respond(request, ctx)` is handed the parsed POST body and returns the output
 * items for that turn -- use `execItem`, `patchItem` and `messageItem` below.
 * Returning nothing ends the turn with an empty assistant message, which is how
 * a scripted conversation says "and stop".
 *
 * IT NEVER AWAITS THE CALLER'S ANSWER ON THE SOCKET LONGER THAN IT HAS TO. A
 * turn parked on an approval holds its HTTP request open the whole time the
 * founder is thinking, so the server must be able to have two of them in flight
 * at once -- which is the entire point of the two-worker proof and is free with
 * node's own concurrency, but is worth saying because a queue here would fake a
 * pass.
 */
export function createStubModel({ respond } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch { parsed = null; }
      const turn = { at: Date.now(), url: req.url, body: parsed };
      requests.push(turn);
      let items = [];
      try {
        items = (await respond(parsed, { requests, index: requests.length - 1 })) ?? [];
      } catch (err) {
        // A THROW IN THE SCRIPT IS A FAILED TURN AND NOT A HANG. The worker on
        // the other end is a real one: leaving the socket open would park it
        // for the full request deadline and the proof would report a timeout
        // instead of the mistake in the script.
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `stub model script threw: ${err?.message ?? err}` } }));
        return;
      }
      // A REFUSAL FROM THE PROVIDER, WHICH IS NOT THE SAME EVENT AS A TURN THAT
      // WENT BADLY. `httpError` below is how a script says "this login is not
      // welcome any more", which is the shape a lapsed Codex subscription has
      // and the one the account bookkeeping was written for.
      if (items && items.__httpError) {
        res.writeHead(items.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: items.message, type: items.kind } }));
        return;
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const id = `resp_${requests.length}`;
      const frame = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      frame({ type: 'response.created', response: { id } });
      for (const item of items) frame({ type: 'response.output_item.done', item });
      frame({
        type: 'response.completed',
        response: { id, output: items, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
      });
      res.end();
    });
  });

  return {
    requests,
    listen: () => new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}/v1`));
    }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/**
 * The model turn asks to run a shell command.
 *
 * `escalate` IS NOT DECORATION AND THE FIRST DRAFT OF THESE PROOFS WAS WRONG
 * WITHOUT IT. Measured 2026-09-07 on a real app-server with the shipping
 * `workerThreadParams` (approvalPolicy `untrusted`, sandbox `workspace-write`):
 * an `exec_command` running `echo hello-from-codex` was NOT carded at all --
 * `item/started` and `item/completed` for a commandExecution, no
 * `item/commandExecution/requestApproval` anywhere. Codex judges an ordinary
 * read-only command inside the workspace safe on its own, which is correct and
 * is also why "run a command and watch the card" is not a thing a proof may
 * assume. `sandbox_permissions: "require_escalated"` is the model saying it
 * wants out of the sandbox, and that is the request the founder is asked about.
 */
export function execItem(cmd, { callId = `call_${Math.random().toString(36).slice(2, 10)}`, workdir = null, escalate = false, justification = null } = {}) {
  const args = { cmd };
  if (workdir) args.workdir = workdir;
  if (escalate) args.sandbox_permissions = 'require_escalated';
  if (justification) args.justification = justification;
  return { type: 'function_call', id: `fc_${callId}`, call_id: callId, name: 'exec_command', arguments: JSON.stringify(args) };
}

/**
 * The model turn asks to edit a file. It goes out as an `exec_command` running
 * `apply_patch`, which is the shape codex-cli 0.148's own system prompt tells a
 * model to use, and it is what makes the server raise
 * `item/fileChange/requestApproval` rather than a command approval.
 */
export function patchItem(patch, opts = {}) {
  return execItem(`apply_patch <<'ASTRAL_PATCH_EOF'\n${patch}\nASTRAL_PATCH_EOF`, opts);
}

/**
 * THE PROVIDER REFUSES, rather than the model answering badly.
 *
 * Returned instead of a list of items. Measured 2026-09-07 on codex-cli
 * 0.148.0: a 500 is RETRIED five times with backoff (about ninety seconds
 * before the turn gives up), and a 401 is terminal on the first answer -- which
 * is what makes it usable in a proof about an account that has stopped working,
 * where the whole point is that the run dies fast enough to count as a fast
 * exit.
 */
export function httpError(status, message, kind = null) {
  const out = [];
  out.__httpError = true;
  out.status = status;
  out.message = message;
  out.kind = kind;
  return out;
}

/** The model turn says something and stops. */
export function messageItem(text) {
  return { type: 'message', id: `msg_${Math.random().toString(36).slice(2, 10)}`, role: 'assistant', content: [{ type: 'output_text', text }] };
}

/**
 * The founder's own words out of a request body, which is how a script tells
 * two workers apart on one stub: there is one model server for the whole proof
 * and both threads post to it.
 *
 * The developer/system blocks are skipped on purpose -- the standing
 * instructions ride there and they are identical on every thread.
 */
export function promptOf(request) {
  const said = [];
  for (const entry of request?.input ?? []) {
    if (entry?.type !== 'message' || entry.role !== 'user') continue;
    for (const part of entry.content ?? []) if (typeof part?.text === 'string') said.push(part.text);
  }
  return said.join('\n');
}

/**
 * A CODEX_HOME OF OUR OWN, POINTED AT THE STUB.
 *
 * Everything Codex reads about who it is lives in this directory, so a home
 * under /tmp is a Codex with no login, no history, no MCP servers of hers and
 * nowhere to write a rollout except here. That is the isolation, and it is the
 * whole reason the proofs can be run by anybody without asking whose machine
 * they are on.
 */
export function stubCodexHome(dir, { url, model = 'stub-model' } = {}) {
  // THE KEY HAS TO BE ON THE PROCESS, NOT ONLY IN THE FILE, AND THE FIRST RUN
  // OF THE TWO-WORKER PROOF DIED ON EXACTLY THIS. `env_key` names an
  // environment variable Codex insists on before it will call the provider at
  // all -- measured, the turn came back `turn/completed status=failed` with
  // "Missing environment variable: `ASTRAL_STUB_KEY`." and no tool call was
  // ever attempted. The supervisor builds an app-server's environment from
  // `process.env` (scrubbed of ANTHROPIC_*, CLAUDE_*, OPENAI_* and CODEX_*), so
  // setting it here is what carries it through. The value is never sent
  // anywhere real: the provider it authenticates is the loopback stub.
  process.env.ASTRAL_STUB_KEY = 'not-a-real-key-the-stub-does-not-check-it';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.toml'), [
    `model = "${model}"`,
    'model_provider = "stub"',
    '',
    '[model_providers.stub]',
    'name = "Astral proof stub"',
    `base_url = "${url}"`,
    'wire_api = "responses"',
    'env_key = "ASTRAL_STUB_KEY"',
    '',
  ].join('\n'));
  return dir;
}
