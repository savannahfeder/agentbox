// ASKING THE PERSON ABOUT ONE ACTION, AND WAITING FOR THEIR SIGNED ANSWER.
//
// This is the body of the approvals channel, lifted out of
// main/approval-prompt-server.mjs unchanged so that every engine asks the same
// way: Claude Code through that MCP server, Grok Build through a PreToolUse
// hook and pi through an extension (main/agent-approval-cli.mjs). One request
// file, one card, one signed answer, one audit line; deny on every failure.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { answerIsHers, appendSpoolLine, cardDigest, readSpoolJson, removeSpoolEntry, spoolEntryExists, writeSpoolFile } from './approvals.mjs';

export const TIMEOUT_MS = 15 * 60_000;
const POLL_MS = 2_000;

export async function askForApproval(args, { spool, publicKey, product = null, item = null, timeoutMs = TIMEOUT_MS, pollMs = POLL_MS } = {}) {
  const SPOOL = spool;
  const PUBLIC_KEY = publicKey;
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
      product,
      item,
      tool: args.tool_name ?? 'unknown',
      input: args.input ?? {},
    };
    // A question that could not be asked has already been answered.
    if (!writeSpoolFile(SPOOL, `${id}.request.json`, JSON.stringify(request))) {
      return { behavior: 'deny', message: 'the approvals spool would not take this request, so nothing was put in front of the founder' };
    }
    const answerName = `${id}.answer.json`;
    const deadline = Date.now() + timeoutMs;
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
          await new Promise((r) => setTimeout(r, pollMs));
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
          finish(SPOOL, id, request, { allow: false, swapped: true });
          console.warn(`zero: approval ${id} was answered for a different card than the one this run asked about; the request file was rewritten under it and nothing has been allowed`);
          return {
            behavior: 'deny',
            message: 'The approval request changed between being asked and being answered, so the founder\'s decision was for a different action and nothing was allowed. Do not retry the same request this session: finish what your grants allow, and file the rest as a review with the exact commands.',
          };
        }
        finish(SPOOL, id, request, answer);
        if (answer.allow) return { behavior: 'allow', updatedInput: args.input ?? {} };
        return { behavior: 'deny', message: answer.note || 'The founder declined this action. Work with what you are already allowed to do, or park the remainder as a review.' };
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    finish(SPOOL, id, request, { allow: false, timeout: true });
    return {
      behavior: 'deny',
      message: 'No answer from the founder within 15 minutes. Do not retry the same request this session: finish what your grants allow, and file the rest as a review with the exact commands.',
    };
  } catch (err) {
    return { behavior: 'deny', message: `approvals channel error: ${err.message}` };
  }
}

// One audit line per decision; the request/answer pair leaves the spool.
function finish(SPOOL, id, request, answer) {
  appendSpoolLine(SPOOL, 'log.jsonl', `${JSON.stringify({ ...request, answer, decidedAt: Date.now() })}\n`);
  for (const f of [`${id}.request.json`, `${id}.answer.json`]) removeSpoolEntry(SPOOL, f);
}

