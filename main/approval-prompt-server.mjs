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

import fs from 'node:fs';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { answerIsHers, appendSpoolLine, cardDigest, readSpoolJson, removeSpoolEntry, spoolEntryExists, writeSpoolFile } from './approvals.mjs';

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

const TIMEOUT_MS = 15 * 60_000;
const POLL_MS = 2_000;

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

async function decide(args) {
  try {
    if (!SPOOL) return { behavior: 'deny', message: 'approvals spool is not configured' };
    // NO KEY IS A CHANNEL THAT CANNOT TELL HER ANSWER FROM A WORKER'S, and a
    // channel that cannot tell must not guess. It refuses here rather than
    // asking and then denying in fifteen minutes, because nothing that arrives
    // in that quarter of an hour could become an approval anyway.
    if (!PUBLIC_KEY) return { behavior: 'deny', message: 'the approvals channel was given no key to check the founder\'s answer with, so nothing here can be approved' };
    fs.mkdirSync(SPOOL, { recursive: true });
    const id = crypto.randomUUID();
    const request = {
      id,
      at: Date.now(),
      product: process.env.ZERO_PRODUCT ?? null,
      item: process.env.ZERO_ITEM ?? null,
      tool: args.tool_name ?? 'unknown',
      input: args.input ?? {},
    };
    // A question that could not be asked has already been answered.
    if (!writeSpoolFile(SPOOL, `${id}.request.json`, JSON.stringify(request))) {
      return { behavior: 'deny', message: 'the approvals spool would not take this request, so nothing was put in front of the founder' };
    }
    const answerName = `${id}.answer.json`;
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      // `lstat` rather than `existsSync`, so this sees exactly what the app's
      // own `listPending` sees: an entry by that name, whatever it is.
      if (spoolEntryExists(SPOOL, answerName)) {
        const answer = readSpoolJson(SPOOL, answerName);
        // AN ANSWER THAT IS NOT HERS IS NOT A DECISION AT ALL, and this is the
        // line the whole file turns on. It used to read `answer?.allow` off
        // whatever was in the directory, so any process that could write here
        // was approved -- another worker's card, or its own.
        //
        // AND IT IS NOT A DENY EITHER, which matters as much: denying on an
        // unreadable answer would let one worker force a No onto another's
        // card, losing her Allow in silence. The file goes and the question
        // goes on waiting, exactly as main/codex-approvals.mjs's own sweep
        // does, and her real answer still lands when she gives it.
        if (!answerIsHers(id, answer, PUBLIC_KEY)) {
          removeSpoolEntry(SPOOL, answerName);
          console.warn(`zero: an answer for approval ${id} that the founder did not write has been deleted; the question is still waiting`);
          await new Promise((r) => setTimeout(r, POLL_MS));
          continue;
        }
        // AND HER DECISION IS ABOUT AN ACTION, NOT ABOUT AN ID. The request
        // file is worker-writable and its name and id survive a rewrite of its
        // contents, so a worker could raise one command, replace the body with
        // a harmless one, and have her Allow on the harmless card honoured
        // against the command THIS PROCESS is still holding. `request` here is
        // that memory: it was built from the tool call and has never been read
        // back off the disk, so comparing it against the digest she signed is
        // the whole check. A mismatch is a deny -- the user said yes to something
        // else -- and it is loud, because only a rewrite can produce it.
        const mine = cardDigest(request);
        if (!mine || answer.card !== mine) {
          finish(id, request, { allow: false, swapped: true });
          console.warn(`zero: approval ${id} was answered for a different card than the one this run asked about; the request file was rewritten under it and nothing has been allowed`);
          return {
            behavior: 'deny',
            message: 'The approval request changed between being asked and being answered, so the founder\'s decision was for a different action and nothing was allowed. Do not retry the same request this session: finish what your grants allow, and file the rest as a review with the exact commands.',
          };
        }
        finish(id, request, answer);
        if (answer.allow) return { behavior: 'allow', updatedInput: args.input ?? {} };
        return { behavior: 'deny', message: answer.note || 'The founder declined this action. Work with what you are already allowed to do, or park the remainder as a review.' };
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    finish(id, request, { allow: false, timeout: true });
    return {
      behavior: 'deny',
      message: 'No answer from the founder within 15 minutes. Do not retry the same request this session: finish what your grants allow, and file the rest as a review with the exact commands.',
    };
  } catch (err) {
    return { behavior: 'deny', message: `approvals channel error: ${err.message}` };
  }
}

// One audit line per decision; the request/answer pair leaves the spool.
function finish(id, request, answer) {
  appendSpoolLine(SPOOL, 'log.jsonl', `${JSON.stringify({ ...request, answer, decidedAt: Date.now() })}\n`);
  for (const f of [`${id}.request.json`, `${id}.answer.json`]) removeSpoolEntry(SPOOL, f);
}

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
