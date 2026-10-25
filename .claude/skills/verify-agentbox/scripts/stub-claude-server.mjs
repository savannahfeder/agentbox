#!/usr/bin/env node
// THE MODEL BEHIND A REAL CLAUDE CODE, FOR THE LIVE COPY'S SETUPS LAYER.
//
//   node stub-claude-server.mjs <instance folder> <port>
//
// The real `claude` binary runs every worker: its reading of the person's
// ~/.claude, their hooks, their connected tools, the app's --mcp-config and
// --settings, the session on disk, --resume. Only the language model is
// replaced, by scripts/lib/claude-stub-model.mjs on a loopback port, so nothing
// is billed and no login is needed. `live.mjs up --setup <name>` starts this
// detached; `down` stops it (its command line names the instance folder).
//
// ON EVERY TASK TURN IT USES THE APP'S OWN STORE TOOL ONCE, the way a real
// worker does first thing: it writes a note onto its own thread with
// update_work_item, then answers. A setup that keeps the store tools from a
// worker (a clashing server name, a deny rule, a hook that blocks) therefore
// fails on the ledger, not on a guess.
//
// Every request is logged to <instance>/claude-model.log, one line each, with
// only what a check needs: which tools Claude Code offered, how it signed the
// request (never the key itself), the tool result it got back, and the token.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { createClaudeStubModel, defaultAnswer, isTaskTurn, userTexts } = await import(path.join(REPO, 'scripts/lib/claude-stub-model.mjs'));

const [instance, portArg] = process.argv.slice(2);
if (!instance) { console.error('usage: stub-claude-server.mjs <instance folder> [port]'); process.exit(2); }
const log = path.join(instance, 'claude-model.log');

/** The text of everything Claude Code sent: system prompt and messages. */
function allText(body) {
  const sys = Array.isArray(body?.system) ? body.system.map((s) => s?.text ?? '').join('\n') : String(body?.system ?? '');
  return `${sys}\n${userTexts(body).join('\n')}`;
}
/** The last user message's blocks, so a turn can tell a new prompt from a tool's answer. */
function lastUserBlocks(body) {
  const m = [...(body?.messages ?? [])].reverse().find((x) => x.role === 'user');
  if (!m) return [];
  return typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : (m.content ?? []);
}

const model = createClaudeStubModel({
  async respond(body, { requests, index }) {
    const req = requests[index];
    const task = isTaskTurn(body);
    const said = allText(body);
    const directive = (name) => said.match(new RegExp(`\\[\\[${name}(?::([^\\]]*))?\\]\\]`));
    const token = [...said.matchAll(/\[\[tok:([^\]]+)\]\]/g)].map((m) => m[1]).pop() ?? null;
    const item = said.match(/Work item id: (w-[0-9a-f]+)/)?.[1] ?? null;
    const names = (body?.tools ?? []).map((t) => t.name);
    const store = names.find((n) => /^mcp__.+__update_work_item$/.test(n) && !/zero-approvals/.test(n)) ?? null;
    const blocks = lastUserBlocks(body);
    const result = blocks.find((b) => b.type === 'tool_result');
    const entry = {
      // `history` above 1 on a reply's first request is a resumed session.
      at: Date.now(), url: req.url, task, item, token, history: (body?.messages ?? []).length,
      tools: names.length, mcp: names.filter((n) => n.startsWith('mcp__')),
      deferred: names.includes('ToolSearch'),
      auth: req.auth,
      toolResult: result ? { isError: !!result.is_error, text: JSON.stringify(result.content ?? '').slice(0, 300) } : null,
    };
    fs.appendFileSync(log, `${JSON.stringify(entry)}\n`);
    if (!task) return 'Stub title';
    if (directive('stub:hang')) await new Promise(() => {});
    const slow = Number(directive('stub:slow')?.[1]);
    if (slow > 0) await new Promise((r) => setTimeout(r, slow));
    // A new prompt (not a tool's answer): write onto the thread first.
    if (!result && store && item) {
      return { toolUse: { name: store, input: { id: item, note: `The Claude stand-in model reached the store.${token ? ` [${token}]` : ''}` } } };
    }
    return defaultAnswer(body);
  },
});

const url = await model.listen(Number(portArg) || 0);
fs.writeFileSync(path.join(instance, 'claude-model.json'), `${JSON.stringify({ url, pid: process.pid })}\n`);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { model.close?.(); process.exit(0); });
