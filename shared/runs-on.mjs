// THE ONE LINE SAYING IT FOUND AN ACCOUNT ALREADY ON THIS MAC.
//
// From a session with a new user, 2026-10-07, in her words: a new user came in,
// started running an agent, and was "like, 'Oh my God, where are the tokens
// coming from? I didn't even connect my account.'"
//
// He was right that nothing said. The app finds whichever coding agent is
// already signed in on the Mac and runs every worker on that subscription
// (main/claude-plan.mjs, main/codex-account.mjs), and the walk is SILENT about
// it by design: `needsPlan` in renderer/src/plan-setup.ts skips the plan
// question entirely when one tool is found and signed in, which is the right
// call and leaves nobody told.
//
// IT IS A ONE-TIME SURPRISE, SO IT GETS A ONE-TIME ANSWER. A row saying this
// permanently, in the sidebar's foot, is what this file held first; it shipped
// on 2026-10-07 and came out the same day. Her words: "we have to get rid of
// this. It should never say that on the sidebar." Somebody asks where the
// tokens are coming from ONCE, on their first day, so the place for the answer
// is the walk they are standing in.
//
// AND IT NAMES NO PLAN. The row said "Claude · Max 20x" and that was the half
// she wanted gone most: "very critically, I want to get rid of that Claude Max
// 20x plan." The question being answered is "did it connect to something of
// mine", not "what am I paying for", and the second one is already answered
// properly on each agent's own page in Settings, where somebody goes when they
// want it.
//
// THE PLAN'S VOCABULARY, NOT THE TOOL'S. "Claude" and "ChatGPT" here, never
// "Claude Code" and "Codex", which is the rule the walk already follows
// (renderer/src/plan-setup.ts: words people know, "never the names of the tools
// underneath"). The tool names stay where they belong: on a byline about which
// agent is working a row (`engineWordFor`, renderer/src/byline.ts).
//
// NOTHING IS SAID UNTIL SOMETHING IS KNOWN. Both functions answer null on an
// engine they cannot name, and the walk draws nothing at all for null rather
// than "checking…" or a dash.

/** The word for the plan behind an engine. Null for an engine we cannot name. */
export function runsOnName(engine) {
  if (engine === 'claude') return 'Claude';
  if (engine === 'codex') return 'ChatGPT';
  return null;
}

/**
 * THE ONE LINE DURING THE WALK, on the Mac where there was nothing to ask.
 *
 *  It replaces silence, not a question: somebody with no coding agent set up
 *  still gets the plan question and the setup card, and never sees this.
 */
export function foundOnThisMac({ engine = null } = {}) {
  const name = runsOnName(engine);
  if (!name) return null;
  return `Your agents will run on the ${name} account already signed in on this Mac.`;
}
