#!/usr/bin/env node
// THE MODEL BEHIND A REAL CODEX, FOR THE LIVE COPY, ANSWERING FROM THE TASK'S WORDS.
//
//   node stub-codex-server.mjs <instance folder> [port] [--setup]
//
// The real `codex` binary runs every worker: the app-server, its JSON-RPC, the
// sandbox, the rollout on disk, and Agentbox's own Codex modules. Only the
// language model is replaced, by scripts/lib/codex-stub-model.mjs on a loopback
// port, so nothing is billed and nobody's ~/.codex is read. `live.mjs up`
// starts this detached and points the copy's CODEX_HOME at it; `down` stops it
// (its command line names the instance folder, which is how `down` finds it).
//
// The task's words carry the script, the same words the Claude stand-in reads:
//   [[tok:abc]]          answer with "abc", so a proof can tell whose answer is whose
//   [[stub:slow:4000]]   take 4 s
//   [[stub:hang]]        never answer
//   [[stub:limit]]       refuse as a ChatGPT plan out of usage does (HTTP 429,
//                        usage_limit_reached), which Codex reports as usageLimitExceeded
//   [[stub:limit-first]] refuse the first time only
// and "reply with exactly the word X" is answered with X, as a model would.
//
// ON A SETUP (`--setup`, live.mjs up --setup <a Codex setup>) it does what the
// Claude stand-in does: on every new task turn it first calls the app's
// `update_work_item` once, so a setup that keeps the store from a worker fails
// on the ledger. And it is the copy's HTTPS proxy as well: a request Codex
// tries to send anywhere but here (chatgpt.com, api.openai.com, github.com)
// arrives as a CONNECT, is logged, and is refused, so nothing a setup runs
// leaves this Mac and the log says what tried to.
//
// Every request is logged to <instance>/codex-model.log, one line each, with
// only what a check needs: how Codex signed it (never the token itself), the
// model, the store tools it offered, the tool result it got back, and any
// [[mark:...]] the person's own files put into what the model was sent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { createStubModel, messageItem, httpError, promptOf, requestText, wordAnswer, offeredTools, searchedTools, toolSearchItem } = await import(path.join(REPO, 'scripts/lib/codex-stub-model.mjs'));
const { readWorld, worldTurn, worldAnswer, titleIn } = await import(path.join(REPO, 'scripts/lib/stand-in-world.mjs'));

const args = process.argv.slice(2);
const setup = args.includes('--setup');
const [instance, portArg] = args.filter((a) => !a.startsWith('--'));
if (!instance) { console.error('usage: stub-codex-server.mjs <instance folder> [port] [--setup]'); process.exit(2); }
const log = (entry) => fs.appendFileSync(path.join(instance, 'codex-model.log'), `${JSON.stringify(entry)}\n`);
const seen = new Map();

const model = createStubModel({
  async respond(request, { requests, index }) {
    const prompt = promptOf(request);
    const all = requestText(request);
    const directive = (name) => prompt.match(new RegExp(`\\[\\[${name}(?::([^\\]]*))?\\]\\]`));
    const token = directive('tok')?.[1] ?? null;
    const key = token ?? prompt.slice(0, 200);
    const last = (request?.input ?? []).at(-1);
    const toolBack = last?.type === 'function_call_output' ? last : null;
    const searched = last?.type === 'tool_search_output';
    // A tool's answer is the same turn going on, not a new attempt at the task.
    const review = /auto-review/.test(request?.model ?? '');
    const attempt = toolBack || searched || review ? (seen.get(key) ?? 1) : (seen.get(key) ?? 0) + 1;
    seen.set(key, attempt);
    const tools = [...offeredTools(request), ...searchedTools(request)];
    const store = tools.find((t) => /update_work_item$/.test(t.name) && !/approvals/.test(t.full)) ?? null;
    const canSearch = tools.some((t) => t.name === 'tool_search');
    const item = all.match(/Work item id: (w-[0-9a-f]+)/)?.[1] ?? null;
    log({
      at: Date.now(), token, attempt, chars: prompt.length, item, review,
      auth: requests[index].auth, model: request?.model ?? null,
      tools: tools.length, deferred: canSearch, mcp: tools.filter((t) => /^mcp__/.test(t.full)).map((t) => t.full),
      toolResult: toolBack ? String(typeof toolBack.output === 'string' ? toolBack.output : JSON.stringify(toolBack.output)).slice(0, 300) : null,
      marks: [...new Set([...all.matchAll(/\[\[mark:([^\]]+)\]\]/g)].map((m) => m[1]))],
    });
    // THE APPROVAL REVIEWER. The app's Auto mode sets `approvalsReviewer:
    // 'auto_review'`, so every MCP call a worker makes, the store's included,
    // is first sent to a model (`codex-auto-review`, no tools) that must answer
    // JSON with an `outcome` (measured on 0.160.0: anything else fails the
    // call as "guardian assessment was not valid JSON"). A reviewer would let
    // a worker write a note on its own thread, and nothing else here needs one.
    if (review) {
      const store = /update_work_item/.test(all);
      return [messageItem(JSON.stringify({ risk_level: 'low', user_authorization: 'unknown', outcome: store ? 'allow' : 'deny',
        rationale: store ? 'A note on the worker\'s own thread in the app\'s store.' : 'The verify stand-in reviewer allows only the store write.' }))];
    }
    // A power test's world (scripts/lib/stand-in-world.mjs), rolled once per new turn.
    const world = toolBack || searched ? {} : readWorld(path.join(instance, 'world.json'));
    const turn = worldTurn(world, 'codex');
    if (directive('stub:limit') || (directive('stub:limit-first') && attempt === 1) || turn.limit) {
      return httpError(429, 'The usage limit has been reached', 'usage_limit_reached');
    }
    if (directive('stub:hang') || turn.hang) await new Promise(() => {});
    if (turn.die) return httpError(500, 'The stand-in model went away mid-turn', 'server_error');
    const slow = Number(directive('stub:slow')?.[1]) || turn.delayMs;
    if (slow > 0) await new Promise((r) => setTimeout(r, slow));
    // A new prompt on a setup: write onto the thread first, as a worker does,
    // asking Codex for its MCP tools first when it keeps them behind a search.
    if (setup && !toolBack && !store && canSearch && !searched && item) return [toolSearchItem('agentbox update_work_item', { callId: `ts_${index}` })];
    if (setup && !toolBack && store && item) {
      const callId = `call_store_${index}`;
      return [{
        type: 'function_call', id: `fc_${callId}`, call_id: callId, name: store.name,
        ...(store.namespace ? { namespace: store.namespace } : {}),
        arguments: JSON.stringify({ id: item, note: `The Codex stand-in model reached the store.${token ? ` [${token}]` : ''}` }),
      }];
    }
    const said = wordAnswer(request) ?? `The verify Codex stand-in answered.${token ? ` [${token}]` : ''}`;
    return [messageItem(Object.keys(world).length ? worldAnswer(said, turn, titleIn(all), attempt) : said)];
  },
});

// THE PROXY HALF. A CONNECT is a request on its way off this Mac.
model.server.on('connect', (req, socket) => {
  log({ at: Date.now(), connect: req.url });
  socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
});

const url = await model.listen(Number(portArg) || 0);
fs.writeFileSync(path.join(instance, 'codex-model.json'), `${JSON.stringify({ url, pid: process.pid })}\n`);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { model.close?.(); process.exit(0); });
