// ONE TOOL CALL FROM GROK BUILD OR PI, ASKED ABOUT ON A CARD.
//
// Run by Grok's PreToolUse hook (main/grok-approvals.mjs) and by pi's
// extension (main/pi.mjs), with the call as JSON on stdin and the engine's
// name as the one argument. It decides whether the call needs a card
// (main/agent-approval-policy.mjs), asks through the same spool and signed
// answer Claude Code's cards use (main/approval-ask.mjs), and prints one line:
//
//   {"decision":"allow"}                      exit 0
//   {"decision":"deny","reason":"…"}          exit 2
//
// That is the shape Grok reads from a hook, and pi's extension reads the same.
// EVERY FAILURE IS A DENY, printed: Grok lets a call through when a hook
// crashes or says nothing, so this must always say something.

import { askForApproval } from './approval-ask.mjs';
import { askMode, needsAsking, readCall } from './agent-approval-policy.mjs';
import { Name } from '../shared/product-name.mjs';

const say = (allow, reason) => {
  process.stdout.write(`${JSON.stringify(allow ? { decision: 'allow' } : { decision: 'deny', reason })}\n`);
  process.exitCode = allow ? 0 : 2;
};

async function main() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const call = readCall(process.argv[2], JSON.parse(text || '{}'));
  if (!call.cwd) call.cwd = process.cwd();
  if (!needsAsking(askMode(process.env.AGENTBOX_ASK), call, { own: process.env.AGENTBOX_OWN_SERVER || null })) return say(true);
  const answer = await askForApproval({ tool_name: call.tool, input: call.input }, {
    spool: process.env.ZERO_APPROVALS_DIR,
    publicKey: process.env.ZERO_APPROVALS_PUBKEY,
    product: process.env.ZERO_PRODUCT ?? null,
    item: process.env.ZERO_ITEM ?? null,
  });
  return answer.behavior === 'allow' ? say(true) : say(false, answer.message || 'The person declined this action.');
}

main().catch((err) => say(false, `${Name} could not ask about this action, so it was not allowed: ${err?.message ?? err}`));
