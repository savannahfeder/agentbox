// The approvals channel: a tiny MCP server that Claude Code calls (via
// --permission-prompt-tool) whenever a headless worker wants to do something
// its standing grants do not cover. The request lands as a file in the spool,
// the app shows the founder a card, her click writes the answer file, and the
// worker unblocks in place. Before this, a gated command ended the story:
// sessions wrote everything and bounced the actual run back to the founder
// as a paste (2026-08-05).
//
// Deny is the default in every failure mode: timeout, spool error, malformed
// answer. An approval can only come from the founder's explicit file.
//
// EVERY TOUCH OF THE SPOOL GOES THROUGH main/approvals.mjs, which is where the
// rule that this directory is worker-writable is written down and enforced --
// nothing opened through a link, nothing opened that is not a regular file,
// every write landed by rename. It used to be bare `fs` here, and the audit
// line was the worst of it: `log.jsonl` is a fixed name, so a worker that
// symlinked it at `briefs/founder.md` had a repeatable append of its own
// `command` string into the standing instructions every session is briefed
// with. This process runs as the worker's own child, so it is the near half of
// that attack (2026-09-04).

import readline from 'node:readline';
import { askForApproval } from './approval-ask.mjs';

const SPOOL = process.env.ZERO_APPROVALS_DIR;

// THE KEY THAT SAYS AN ANSWER IS THE USER'S, AND IT IS SAFE TO HAND US.
//
// This process is the worker's own child, so its environment is the worker's to
// read and anything secret given here is a secret the forger has. This is the
// PUBLIC half of a pair whose private half never leaves Agentbox's process: it
// verifies and it cannot sign, which is exactly why it can travel this way.
// main/approvals.mjs holds the whole argument, including what it does not
// close.
const PUBLIC_KEY = process.env.ZERO_APPROVALS_PUBKEY;


const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

const decide = (args) => askForApproval(args, {
  spool: SPOOL,
  publicKey: PUBLIC_KEY,
  product: process.env.ZERO_PRODUCT ?? null,
  item: process.env.ZERO_ITEM ?? null,
});

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: {
      protocolVersion: params?.protocolVersion ?? '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'zero-approvals', version: '1.0.0' },
    } });
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: [{
      name: 'approval_prompt',
      description: 'Asks the founder, live in her inbox, to approve one gated action. She answers within minutes when present; a 15-minute silence is a deny. Use only when the work genuinely cannot proceed without it.',
      inputSchema: {
        type: 'object',
        properties: {
          tool_name: { type: 'string' },
          input: { type: 'object' },
          tool_use_id: { type: 'string' },
        },
        required: ['tool_name', 'input'],
      },
    }] } });
  } else if (method === 'tools/call' && params?.name === 'approval_prompt') {
    const result = await decide(params.arguments ?? {});
    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } });
  } else if (id !== undefined) {
    send({ jsonrpc: '2.0', id, result: {} });
  }
});
