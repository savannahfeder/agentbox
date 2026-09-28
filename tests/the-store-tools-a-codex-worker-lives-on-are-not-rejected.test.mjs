// A CODEX WORKER'S STORE TOOLS ARE NOT REJECTED BY A PERSON NOBODY ASKED.
//
// The founder started a Codex task on 2026-09-22 and it stopped on its first
// call, `claim_work_item`, with one sentence and nothing else:
//
//   {"content":[{"type":"text","text":"user rejected MCP tool call"}],
//    "isError":true}
//
// No card was drawn, no approval was shown to her, and the worker could not
// tell a refusal she had made from one the app had made for her. Every store
// tool a Codex worker has is an MCP tool call, so this was not one lost call:
// it was a worker that could not claim a row, write a checkpoint or finish one.
//
// WHAT IT ACTUALLY WAS, measured on this Mac 2026-09-22 against codex-cli
// 0.153.4 by driving a real `codex app-server` exactly as `workerThreadParams`
// drives one -- `approvalPolicy: untrusted`, `sandbox: workspace-write`, one
// stdio MCP server on the thread -- and asking the model to call its one tool:
//
//   item/started  mcpToolCall server=probe tool=ping status=inProgress
//   REQUEST       mcpServer/elicitation/request
//                 { serverName: "probe", mode: "form",
//                   message: 'Allow the probe MCP server to run tool "ping"?',
//                   _meta: { codex_approval_kind: "mcp_tool_call",
//                            persist: ["session","always"],
//                            tool_description: "Returns the word pong.",
//                            tool_params: {} },
//                   requestedSchema: { type: "object", properties: {} } }
//
// AN MCP TOOL CALL IS APPROVED THROUGH THE ELICITATION CHANNEL. There is no
// `item/mcpToolCall/requestApproval` in the protocol: the stable schema dump
// has exactly three `requestApproval` methods and none of them is this one. So
// the method was not on `APPROVAL_SHAPE`, the transport gave it the error frame
// it gives every request it cannot answer, and Codex turned that into the
// sentence above. Both answers were then measured against the same live server:
//
//   answered with the error frame  -> mcpToolCall failed,
//                                     "user rejected MCP tool call"
//   answered `{action:"accept"}`   -> the tool ran and returned its result
//
// The deny-by-default the transport is built around was right about everything
// except this: a request it had never been taught is refused, and one of them
// turned out to be the channel a whole engine reaches the store through.
//
// AND THE STORE'S OWN TOOLS ARE NOT A QUESTION FOR HER. Carding them would put
// three approvals in front of every Codex run before it could say anything, for
// plumbing she cannot meaningfully answer. The Claude Code path has always said
// the same thing in its own grammar: `worker-permissions.json` grants the store
// server's tools outright and they never reach the spool. Everything else that
// arrives on this channel still goes to her, as a card.

import { describe, it, expect, vi, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createCodexAppServer, REFUSAL_DECISION } from '../main/codex-app-server.mjs';
import { createCodexApprovals, codexApprovalCard, mcpToolCard } from '../main/codex-approvals.mjs';
import { listPending } from '../main/approvals.mjs';

const ELICIT = 'mcpServer/elicitation/request';
const STORE = 'agentbox';

const dirs = [];
const root = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-mcp-approvals-'));
  dirs.push(dir);
  return dir;
};
const tick = () => new Promise((resolve) => { setImmediate(resolve); });

afterAll(() => {
  for (const dir of dirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/** One tool-call elicitation, framed as the live server really framed it. */
const askToCall = (serverName, tool = 'claim_work_item', extra = {}) => ({
  threadId: 'T-1',
  turnId: 'TURN-1',
  serverName,
  mode: 'form',
  message: `Allow the ${serverName} MCP server to run tool "${tool}"?`,
  requestedSchema: { type: 'object', properties: {} },
  _meta: {
    codex_approval_kind: 'mcp_tool_call',
    persist: ['session', 'always'],
    tool_description: 'Take exclusive ownership of a work item.',
    tool_params: {},
    tool_params_display: [],
  },
  ...extra,
});

/* ============================== the transport ============================= */

function fakeCodex() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const sent = [];
  child.stdin = {
    write: (chunk, cb) => {
      for (const line of String(chunk).split('\n')) if (line.trim()) sent.push(JSON.parse(line));
      cb?.(null);
      return true;
    },
    end: vi.fn(),
  };
  child.kill = vi.fn(() => true);
  return {
    child,
    sent,
    say: (msg) => child.stdout.emit('data', Buffer.from(JSON.stringify(msg) + '\n')),
    answerTo: (id) => sent.find((m) => m.id === id && (m.result !== undefined || m.error !== undefined)),
  };
}

async function withThread(handlers = {}) {
  const codex = fakeCodex();
  const client = createCodexAppServer({ transport: codex.child });
  const opening = client.startThread({ cwd: '/tmp/product' }, handlers);
  const startId = codex.sent.find((m) => m.method === 'thread/start').id;
  codex.say({ jsonrpc: '2.0', id: startId, result: { thread: { id: 'T-1', ephemeral: false } } });
  await opening;
  return { codex, client };
}

describe('the answer an MCP tool call gets back', () => {
  it('is an accept in the elicitation vocabulary when the handler allows it', async () => {
    const { codex } = await withThread({ onApproval: async () => 'accept' });

    codex.say({ jsonrpc: '2.0', id: 7, method: ELICIT, params: askToCall(STORE) });
    await tick();

    // `{action}`, not `{decision}`: McpServerElicitationRequestResponse takes
    // the one and the command approvals take the other, and an answer in the
    // wrong vocabulary is a malformed frame rather than a yes.
    expect(codex.answerTo(7)).toEqual({ jsonrpc: '2.0', id: 7, result: { action: 'accept' } });
  });

  // THE REGRESSION ITSELF. Before this, the method was not on the table and
  // this frame was `{error: {code: -32001}}`, which reached the worker as
  // "user rejected MCP tool call" -- a rejection nobody made.
  it('is a decline and never an error frame when nobody can answer it', async () => {
    const { codex } = await withThread({}); // no onApproval on this thread at all

    codex.say({ jsonrpc: '2.0', id: 8, method: ELICIT, params: askToCall(STORE) });
    await tick();

    expect(codex.answerTo(8)).toEqual({ jsonrpc: '2.0', id: 8, result: { action: REFUSAL_DECISION } });
    expect(codex.answerTo(8).error).toBeUndefined();
  });

  // `acceptForSession` is a command-approval word. The elicitation takes three
  // actions and that is not one of them, so it is junk here rather than a yes
  // that lasts a session.
  it('refuses a word the elicitation cannot express rather than sending it on', async () => {
    const { codex } = await withThread({ onApproval: async () => 'acceptForSession' });

    codex.say({ jsonrpc: '2.0', id: 9, method: ELICIT, params: askToCall(STORE) });
    await tick();

    expect(codex.answerTo(9)).toEqual({ jsonrpc: '2.0', id: 9, result: { action: REFUSAL_DECISION } });
  });
});

/* ================================ the card =============================== */

describe('what an MCP tool call looks like if it does reach her', () => {
  it('draws the server, the question and the arguments', () => {
    const params = askToCall('playwright', 'browser_navigate');
    params._meta.tool_params = { url: 'https://example.com' };

    expect(mcpToolCard(params)).toEqual({
      tool: 'Mcp',
      input: {
        description: 'Allow the playwright MCP server to run tool "browser_navigate"?',
        server: 'playwright',
        arguments: JSON.stringify({ url: 'https://example.com' }, null, 2),
      },
    });
    expect(codexApprovalCard(ELICIT, params)).toEqual(mcpToolCard(params));
  });

  // A card that says only "an MCP tool" is a card she cannot answer, so there
  // is nothing to draw and the refusal is said out loud instead.
  it('draws nothing when the server said nothing she could read', () => {
    expect(mcpToolCard(askToCall('x', 'y', { message: '   ' }))).toBeNull();
    expect(mcpToolCard(null)).toBeNull();
  });
});

/* ============================== the decision ============================= */

describe('who is asked about an MCP tool call', () => {
  it('lets the store server through with no card at all', async () => {
    const storeRoot = root();
    const approvals = createCodexApprovals({ storeRoot });
    const cards = approvals.scope({ product: 'agentbox', item: 'w-1', storeServer: STORE });

    const answered = await cards.handle(ELICIT, askToCall(STORE));

    expect(answered).toBe('accept');
    expect(listPending(storeRoot)).toEqual([]);
    expect(approvals.pending()).toEqual([]);
  });

  it('still asks her about any other server, on the card she already knows', async () => {
    const storeRoot = root();
    const approvals = createCodexApprovals({ storeRoot });
    const cards = approvals.scope({ product: 'agentbox', item: 'w-1', storeServer: STORE });

    const asked = cards.handle(ELICIT, askToCall('playwright', 'browser_navigate'));
    await tick();

    const [waiting] = listPending(storeRoot);
    expect(waiting.tool).toBe('Mcp');
    expect(waiting.input.server).toBe('playwright');

    expect(approvals.settle(waiting.id, false, 'not this one')).toBe(true);
    expect(await asked).toBe(REFUSAL_DECISION);
  });

  // A personal session is handed no store server, so nothing takes the silent
  // path on one: the name has to have come from Agentbox's own launch.
  it('asks about a server calling itself the store when this run has none', async () => {
    const storeRoot = root();
    const approvals = createCodexApprovals({ storeRoot });
    const cards = approvals.scope({ product: 'agentbox', item: 'w-1', storeServer: null });

    cards.handle(ELICIT, askToCall(STORE));
    await tick();

    expect(listPending(storeRoot)).toHaveLength(1);
  });

  // An elicitation that is NOT a tool-call approval is a form asking for typed
  // input, which this app cannot fill in for her. It is refused, out loud on
  // the run rather than in silence.
  it('refuses a form the store server asks and says so on the run', async () => {
    const storeRoot = root();
    const approvals = createCodexApprovals({ storeRoot });
    const said = [];
    const cards = approvals.scope({ item: 'w-1', storeServer: STORE, say: (line) => said.push(line) });

    const answered = await cards.handle(ELICIT, {
      threadId: 'T-1',
      serverName: STORE,
      mode: 'form',
      message: 'Which branch should I use?',
      requestedSchema: { type: 'object', properties: { branch: { type: 'string' } } },
    });

    expect(answered).toBe(REFUSAL_DECISION);
    expect(said.join(' ')).toContain(ELICIT);
    expect(listPending(storeRoot)).toEqual([]);
  });
});
