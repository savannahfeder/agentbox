// WHAT A DEAD SPAWN IS ALLOWED TO SAY ON HER SCREEN.
//
// The old rule was: take the last words of the session that died and print
// them. That is how she came to be reading "Agents are failing to start: done:
// Failed to authenticate: OAuth session expired and could not be refreshed"
// across the top of her inbox. Her three complaints were all correct. There is
// no OAuth in Agentbox, so the sentence names a thing that does not exist here.
// It is ugly. And it was on screen while agents were working perfectly well,
// because it was about one of her two Claude accounts and not about the app.
//
// So the raw text never reaches the renderer again. It goes in the session's
// own trace log, which is where a person debugging wants it, and what she is
// shown is one sentence of ours written in plain words.
//
// Every sentence here has to survive the same test: read it out loud to
// somebody who has never heard of a subprocess, and they know what happened
// and what to do about it.

// The shapes a CLI uses when the account it was handed cannot be used at all.
// Matching is deliberately loose: these strings have changed wording several
// times and a miss only costs us the generic sentence, never a crash.
//
// THIS SET SAID "the shapes the CLAUDE CLI uses" AND HAD NEVER BEEN POINTED AT
// CODEX. It is right about Codex anyway, and that is measured rather than
// assumed. On 2026-09-05 `codex app-server` (codex-cli 0.148.0) was driven the
// way main/codex-app-server.mjs drives it, with CODEX_HOME pointed at an empty
// directory so there was no auth.json and her real ~/.codex login was neither
// read nor written. The turn retried ten times and failed with
//
// unexpected status 401 Unauthorized: Missing bearer or basic authentication in
// header, url: https://api.openai.com/v1/responses, cf-ray:
//
// which `/unauthoriz/i` below already catches. NOTHING WAS ADDED HERE, and the
// absence is the finding: `unauthorized` is also the schema's own code for it
// (see AT_LIMIT), so the token and the prose land on the same pattern.
//
// WORTH KNOWING FOR THE NEXT READER: what came back was the RAW HTTP text, not
// Codex's own "run codex login" sentence. The app-server passes the transport's
// words through. tests/a-codex-run-that-is-signed-out-or-capped-says-which
// holds all of it.

// AN ACCOUNT THAT IS SIGNED IN AND NOT ALLOWED TO RUN.
//
// She was. Her second login was intact and her browser sign-in succeeded every
// time she did it; the WORKSPACE that account belongs to has Claude Code turned
// off. Run by hand on her Mac, this is the whole of what the CLI says:
//
//   Your organization has disabled Claude subscription access for Claude Code ·
//   Use an Anthropic API key instead, or ask your admin to enable access
//
// "subscription access" is in the list below, so every one of those was filed
// as a login that had run out and she was told to type /login. She did, twice
// in one afternoon; both logins worked; nothing changed, because no login can
// change an admin's policy. FOUR dead runs on one row that day, all four
// carrying "Sign that account back in and it picks straight up."
//
// TESTED BEFORE SIGNED_OUT, which is the whole of the fix: these lines say
// "subscription" and "access" and mean something else entirely.
//
// The API-key half of the CLI's sentence is never repeated to her. Workers bill
// to her subscription and never to a key (CLAUDE.md), so passing that advice on
// would be this app telling her to do the one thing it refuses to do.
import { NAME, Name } from '../shared/product-name.mjs';
const ORG_BLOCKED = [
  /organi[sz]ation has disabled/i,
  /disabled for (your|this) organi[sz]ation/i,
  /ask your admin/i,
];

const SIGNED_OUT = [
  /oauth/i,
  /session expired/i,
  /could not be refreshed/i,
  /failed to authenticate/i,
  /not logged in/i,
  /please run\s*\/?login/i,
  /invalid api key/i,
  /unauthoriz/i,
  /subscription access/i,
];

const AT_LIMIT = [
  /usage limit/i,
  /rate limit/i,
  /quota/i,
  /out of credit/i,
  /insufficient credit/i,
  // THE WORDS THE CLI ACTUALLY PRINTS, AND THE REASON SHE WAS TOLD
  // NOTHING.Claude Code never says "usage limit". Not one pattern above
  // matched either, so every limit she ever hit was filed 'unknown' and drew
  // the generic sentence, which for a limit is actively false: it tells her
  // this will keep failing until it is fixed, when it clears itself at the
  // time printed on the same line. MEASURED across all 3,769 trace logs in
  // her store: 50 runs on 27 rows.
  /hit your [a-z]{0,12} ?limit/i,
  /session limit/i,
  /weekly limit/i,
  // AND THE ONE PATTERN IN THIS FILE THAT IS NOT ABOUT ENGLISH.
  //
  // A limit cannot be provoked on purpose without spending her real
  // subscription, so this set could not be measured against Codex the way
  // SIGNED_OUT above was. Two things were done instead of guessing.
  //
  // Every one is already matched by a pattern above, so NO WORDING PATTERN WAS
  // ADDED.
  //
  // SECOND, THE STRUCTURAL ONE. `codex app-server generate-json-schema` -- the
  // binary's own generator, run on this Mac -- defines TurnError as
  // `{ message, additionalDetails, codexErrorInfo }`, and CodexErrorInfo as an
  // enum including `usageLimitExceeded`. That is a name published by the vendor
  // rather than prose that drifts, and main/codex-session.mjs was discarding it
  // and leaving the classifier to read the sentence. It now puts the code in
  // front of the line, where the 300-character window `noteExitForBackoff`
  // takes cannot cut it off, and this is what reads it.
  //
  // NARROW ON PURPOSE. The same enum carries `contextWindowExceeded` and
  // `sessionBudgetExceeded`, and NEITHER is her subscription -- one is the
  // model's context window, one is a per-run budget somebody set. A rule about
  // the word "exceeded" would file both as a limit and tell her to wait for a
  // reset that is never coming.
  /\busageLimitExceeded\b/,
];

// A RUN THE MACHINE OR THE NETWORK CUT OFF. Nothing is wrong with the account
// and there is nothing for her to do, which is why this cannot stay inside
// 'unknown': the generic sentence ends "it will keep failing the same way
// until this is fixed", and a laptop that went to sleep is not a thing to fix.
// MEASURED on her store 2026-08-28: 182 of the 239 unnamed runs are these, and
// the single biggest cause of a dead run anywhere in the app is her own Mac
// going to sleep mid-response, 133 runs across 63 rows.
const INTERRUPTED = [
  /went to sleep/i,
  /connection (closed|lost|dropped)/i,
  /response stopped arriving/i,
  /may be incomplete/i,
  /econnreset|enotfound|etimedout|econnrefused/i,
  /unable to connect/i,
  /can.{0,3}t reach the api/i,
  /timed out/i,
  /\b(429|500|502|503|529)\b/,
  /overloaded/i,
];

// A workspace the CLI refuses to run in. Distinct from the two above because
// the fix is a folder, not an account.
const WORKSPACE = [
  /untrusted/i,
  /trust this folder/i,
  /not a git repos/i,
  // CODEX'S OWN WORDING, AND IT MATCHES NONE OF THE THREE ABOVE. What it
  // actually prints, measured 2026-08-27 on codex-cli 0.144.0: "Not inside a
  // trusted directory and --skip-git-repo-check was not specified." There is
  // no "untrusted" in that sentence and no "git repository" either, so every
  // dead Codex spawn was filed 'unknown' and drew the generic sentence --
  // which for this cause is actively wrong, because it tells her the run will
  // keep failing until something is fixed without naming the folder that is
  // the fix.
  //
  // These two lines were here from 2026-08-25 and went out with the whole
  // engine on 08-27 (258d71d). They are back BEFORE anything can route to
  // Codex, deliberately: a cause that is only classified once the first Codex
  // run dies is a cause that is not classified when the first Codex run dies.
  /not inside a trusted directory/i,
  /skip-git-repo-check/i,
];

// WHICH OF THE THREE THINGS WENT WRONG, from whatever the tool printed.
// 'unknown' is a first-class answer, not a failure: an honest generic sentence
// beats a confident wrong one.
export function troubleCause(raw) {
  const text = String(raw ?? '');
  if (!text.trim()) return 'unknown';
  // FIRST, because an organization's refusal mentions the subscription and
  // reads as a signed-out login to the list below.
  if (ORG_BLOCKED.some((re) => re.test(text))) return 'org-blocked';
  if (SIGNED_OUT.some((re) => re.test(text))) return 'signed-out';
  if (AT_LIMIT.some((re) => re.test(text))) return 'at-limit';
  if (WORKSPACE.some((re) => re.test(text))) return 'workspace';
  // LAST ON PURPOSE, so every text that already had a name keeps it. A dropped
  // connection is the weakest of the four claims: an account that is signed out
  // or capped often mentions a connection on the way down, and the account is
  // the fact worth saying.
  if (INTERRUPTED.some((re) => re.test(text))) return 'interrupted';
  return 'unknown';
}

// WHEN THE LIMIT LETS GO, straight off the line the CLI printed.
//
// carries the one thing she actually wants to know, and we were throwing it
// away and then telling her the vaguer "when the limit resets". The timezone
// is dropped rather than shown: this Mac is set to America/Los_Angeles and
// every limit line in her store prints that same zone, so naming it would only
// add a word she has to read. Null when there is no time to quote, and then
// the sentence falls back to the wording that has always been there.
export function limitResetsAt(raw) {
  // Both wordings are real: the CLI's own line is "resets 6pm" and the API's
  // is "Your weekly limit resets at 4pm", so the "at" is optional.
  const m = /resets\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i.exec(String(raw ?? ''));
  return m ? m[1].replace(/\s+/g, '').toLowerCase() : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// THE SAME HOUR AS A MOMENT, so the fleet can wait exactly until it
// (2026-09-22: a limit that reset at 6:50pm held every agent until 7:03pm,
// because the app waited a fixed thirty minutes instead of reading this line).
// The next local occurrence of that clock time at or after `from`; null when
// the line names no hour.
export function limitResetMoment(raw, from = Date.now()) {
  // CODEX NAMES A DAY, NOT AN HOUR: "try again at Sep 28th, 2026 1:05 PM"
  // (codex-cli 0.153.4, 2026-09-24). A weekly limit read as "thirty minutes"
  // put the capped login back in the pool every half hour for four days.
  const dated = /try again at ([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4}),? (\d{1,2}):(\d{2})\s*(am|pm)/i.exec(String(raw ?? ''));
  if (dated) {
    const month = MONTHS.indexOf(dated[1].slice(0, 3).toLowerCase());
    if (month >= 0) {
      const h = (Number(dated[4]) % 12) + (dated[6].toLowerCase() === 'pm' ? 12 : 0);
      return new Date(Number(dated[3]), month, Number(dated[2]), h, Number(dated[5]), 0, 0).getTime();
    }
  }
  const hour = limitResetsAt(raw);
  if (!hour) return null;
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(hour);
  if (!m) return null;
  const h = (Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0);
  const d = new Date(from);
  d.setHours(h, Number(m[2] ?? 0), 0, 0);
  if (d.getTime() < from - 60_000) d.setDate(d.getDate() + 1);
  return d.getTime();
}

// AN ACCOUNT THAT CANNOT BE USED AT ALL UNTIL A PERSON DOES SOMETHING.
// Worth its own question because it is the one cause where trying again in
// thirty minutes cannot possibly help, so the account leaves the rotation on
// the first sighting rather than after three.
export function needsHerHands(cause) {
  // Both of these are true until a PERSON acts, and neither of them is the
  // same person: one is her, in a terminal; one is an admin of a workspace she
  // may not run. What they share is the only thing this question asks — trying
  // again in thirty minutes cannot possibly help.
  return cause === 'signed-out' || cause === 'org-blocked';
}

// WHAT SHE READS WHEN NOT ONE AGENT CAN START ANYWHERE.
// Not "an error occurred". The subject of the sentence is the thing she cares
// about, which is her agents, and the reason follows it in plain words.
export function troubleSentence(cause) {
  if (cause === 'signed-out') return 'No agents can start. Your Claude login has run out.';
  if (cause === 'org-blocked') return 'No agents can start. Your organization has turned Claude Code off.';
  if (cause === 'at-limit') return 'No agents can start. Your Claude plan is at its limit.';
  if (cause === 'workspace') return 'No agents can start. Claude will not run in this folder.';
  if (cause === 'interrupted') return 'No agents can start. The connection to Claude keeps dropping.';
  return 'No agents can start on this Mac right now.';
}

// THE SECOND LINE: what happens next, so the first line is never a dead end.
// A sentence that only names a problem makes her go and find out whether she
// is meant to do something; these say it.
export function troubleRemedy(cause) {
  // ). "Sign in to Claude again" is a thing to go and work out; /login is a
  // thing to type.
  if (cause === 'signed-out') return 'Open Claude in a terminal, type /login, and they pick straight back up.';
  if (cause === 'org-blocked') return 'Ask an admin of that Claude workspace to turn Claude Code back on.';
  if (cause === 'at-limit') return 'They start again on their own when it resets.';
  if (cause === 'workspace') return 'Open the folder in Claude once and say yes to trusting it.';
  if (cause === 'interrupted') return `Nothing to do. ${Name} tries them again on its own.`;
  return `${Name} keeps trying on its own.`;
}

// THE SAME FACT ABOUT ONE ACCOUNT, on the Accounts page, where the reader is
// already looking at a list of accounts and does not need the word again.
export function accountSentence(cause, dir) {
  // The folder comes in because the row that shows this sentence REPLACES the
  // folder line with it, so "with this folder set" pointed at something that
  // was no longer on the screen. With the path in the sentence the whole
  // instruction is one line she can retype.
  if (cause === 'signed-out') {
    // Home shortened to ~, the way the rail and the onboarding already draw a
    // folder, so the command fits the row instead of breaking across two lines
    // in the middle of the path. Verified in zsh: the tilde still expands in a
    // command-prefix assignment, so the line stays something she can retype.
    const short = dir ? dir.replace(/^\/Users\/[^/]+/, '~') : null;
    return short
      ? `Signed out. In a terminal run CLAUDE_CONFIG_DIR=${short} claude, then type /login.`
      : 'Signed out. Open Claude in a terminal and type /login.';
  }
  // IT SAYS "SIGNED IN" OUT LOUD, because that is the sentence she came to this
  // page to argue with. No command rides with this one: there is nothing here
  // she can type, and offering one is how she spent an afternoon logging in.
  if (cause === 'org-blocked') {
    return 'Signed in, but its organization has turned Claude Code off. Only an admin of that workspace can turn it back on.';
  }
  if (cause === 'at-limit') return 'At its limit. It rejoins on its own when the limit resets.';
  if (cause === 'workspace') return 'Claude would not run in the folder this was asked to work in.';
  if (cause === 'interrupted') return `Its runs keep getting cut off. ${Name} is trying them again.`;
  return `Its sessions are dying on arrival. ${Name} is keeping the other one busy.`;
}

/* ------------------ the same fact about a whole ENGINE -------------------- */
// WHAT THE SECOND CODING AGENT'S CARD SAYS WHEN NOTHING WILL RUN ON IT.
//
// THE HOLE THIS FILLS. Trouble is remembered per ACCOUNT, keyed through
// `Supervisor#_accountKey`, which prefixes the second engine because both
// engines call their primary login 'default'. So a dead Codex spawn is filed at
// `codex:default`, `status` exports that key verbatim, and the only reader --
// the Accounts page -- indexes by a bare Claude folder name and can never match
// it. The fleet-wide sentences above cannot speak for Codex either: the brake
// they belong to is armed only by a Claude exit with no healthy Claude account
// left, deliberately, because Codex is the second engine and a row it refuses
// still runs. So a lapsed Codex subscription stopped every Codex task and the
// only place the fact existed was the individual rows.
//
// WHY IT IS NOT `accountSentence` WITH A DIFFERENT WORD. That one is about ONE
// ACCOUNT among several on a page listing them, and its signed-out line hands
// her `CLAUDE_CONFIG_DIR=... claude` -- a command for the other engine, naming a
// folder Codex does not have. This is about an ENGINE, said on the engine's own
// card, and it deliberately says nothing about who is signed in: `auth.json`
// carries an opaque account id and no email, and a uuid is not a person.
//
// THE COMMAND IS THE REAL ONE. `codex login` is codex-cli 0.148.0's own
// subcommand, read off `codex --help` on this Mac 2026-09-05, for the same
// reason /login is named next door: "sign in again" is a thing to go and work
// out; a command is a thing to type.
export function engineTroubleNote(cause, engineWord = 'Codex') {
  if (cause === 'signed-out') {
    return `${engineWord} is signed out, so nothing runs on it. Open a terminal, run codex login, and its tasks pick straight back up.`;
  }
  // A LIMIT IS NOT A THING SHE HAS TO FIX, and saying it is would be worse than
  // saying nothing: it clears itself. Same distinction `troubleRemedy` draws.
  if (cause === 'at-limit') return `${engineWord} is at its usage limit, so its tasks are waiting. They start again on their own when it resets.`;
  if (cause === 'workspace') return `${engineWord} would not run in the folder a task asked to work in. Open that folder in ${engineWord} once and allow it.`;
  if (cause === 'interrupted') return `${engineWord} runs keep getting cut off. ${Name} is trying them again on its own.`;
  return `${engineWord} sessions are dying on arrival, so its tasks are not moving. ${Name} keeps trying.`;
}

/* ------------------ the line above the list (her look four) --------------- */
// WHAT THE LINE ABOVE HER INBOX SAYS WHEN TASKS ARE NOT RUNNING.
//
// Four was this line, said once for the whole app in the surface it already
// owns, with the silent rows left as they are: "8 tasks have not been able to
// run since yesterday. Nothing has started on any of them."
//
// The count is the point, and it is why this is a different sentence from
// `troubleSentence` above rather than a rewording of it. That one is about the
// FLEET, and it can only ever be true when every account on the Mac is down at
// once. That is why her screen stayed quiet: four Codex tasks and four on a
// signed-out login sat there all day while her other agents worked, so the
// fleet was never down and the one line the app owns was structurally unable to
// speak. The subject here is her TASKS, which is the thing she went looking for
// and the thing that was actually stuck.

// WHEN IT STARTED, IN WORDS, and nothing at all when it started just now.
// Under three hours the clause is noise, because everything in her inbox is
// from today. Past that it carries the weight of the sentence: "since
// yesterday" is the difference between a blip and a day lost.
export function sinceWords(since, now = Date.now()) {
  if (!since || !Number.isFinite(since) || since > now) return '';
  if (now - since < 3 * 60 * 60_000) return '';
  const then = new Date(since);
  const today = new Date(now);
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (since >= midnight) {
    // Her Mac's own clock, written the way a person says it out loud: 1:48pm.
    const h = then.getHours();
    const hour = h % 12 === 0 ? 12 : h % 12;
    const mins = String(then.getMinutes()).padStart(2, '0');
    return ` since ${hour}:${mins}${h < 12 ? 'am' : 'pm'}`;
  }
  if (since >= midnight - 24 * 60 * 60_000) return ' since yesterday';
  if (since >= midnight - 6 * 24 * 60 * 60_000) {
    return ` since ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][then.getDay()]}`;
  }
  return ' for over a week';
}

// THE FACT, in her nouns: tasks, run, started. No engine, no account, no folder.
export function strandedSentence({ count, since, now = Date.now() } = {}) {
  const n = Math.max(0, Math.trunc(count ?? 0));
  return `${strandedTitle(n)}${sinceWords(since, now)}.`
    + ` Nothing has started on ${n !== 1 ? 'any of them' : 'it'}.`;
}

// THE SAME FACT WITH NOTHING AFTER IT, which is what the row carrying it is
// titled. Here rather than in the renderer so the row, the sentence above and
// anything else that ever says this cannot drift into three ways of counting
// the same tasks. One task has, eleven tasks have.
export function strandedTitle(count) {
  const n = Math.max(0, Math.trunc(count ?? 0));
  const many = n !== 1;
  return `${n} task${many ? 's' : ''} ${many ? 'have' : 'has'} not been able to run`;
}

// THE SECOND LINE: what happens next, so the first is never a dead end.
//
// One cause gets the fix for that cause, which is the sentence the app already
// uses when the whole fleet is down. Two or more and there is no single fix to
// name, so it says that instead of naming the commonest one and leaving her to
// find out it only mended half of them. Each row carries its own reason
// (`deadRunSentence`), which is where that detail belongs and where it fits.
export function strandedRemedy(causes = []) {
  const distinct = [...new Set(causes)];
  if (distinct.length === 1) return troubleRemedy(distinct[0]);
  return 'They are not all stuck on the same thing. Each row says which.';
}

/* ----------------------- a run that said nothing at all ------------------- */
// WHAT GOES ON HER ROW WHEN A WORKER DIED WITHOUT WRITING A WORD.
//
// It happened blindly because nothing anywhere was allowed to say it. A worker
// writes its own status through the store, so a worker that dies before it
// writes leaves the row exactly as it was: still open, still in her inbox,
// indistinguishable from one nobody has picked up yet. The supervisor knew
// every time — it counted the runs in `fruitless` — and the count never left
// the process. Measured on her store that day: six Codex tasks, 18 spawns, all
// dead inside about a second, zero words on any of the six rows. Two of them
// sat there a full day.
//
// So this sentence is written ONTO THE ROW by the supervisor itself, which is
// the one reader that survives the worker. It is deliberately about her task
// and not about our machinery: no exit codes, no engine internals, no paths.
//
// `runs` is how many times this row has now been tried and moved nothing, and
// it is said out loud from the second try, because "it happened again" is the
// part that tells her this is not a blip.
// THE FIVE OPENERS, ONE PER CAUSE, WHERE BOTH DIRECTIONS CAN READ THEM.
//
// They were five branches inside the sentence below, which was fine while
// nothing ever had to read one back. `deadRunCause` at the foot of this file
// does: a row carrying one of these sentences is a row NOTHING RAN ON, and the
// count above her list has to be able to tell that from a row a worker
// answered. Writing the words out twice would be two vocabularies waiting to
// drift apart, so there is one map and the sentence is built off it.
//
// FIRST SENTENCE UNDER 112 CHARACTERS, because that is where her inbox row
// clips (SUMMARY_BUDGET in renderer/src/list-rules.ts) and this is the whole
// point of the message. Longest of the five is 96 with "Claude Code" in front.
const DEAD_RUN_OPENERS = {
  workspace: "would not start in this project's folder, so nothing has been done here.",
  'signed-out': 'could not sign in, so nothing has been done on this task.',
  'org-blocked': 'is switched off for that account by its organization, so nothing has been done.',
  'at-limit': 'is at its usage limit, so nothing has been done on this task.',
  interrupted: 'was cut off in the middle, so nothing has been done on this task.',
  unknown: 'stopped before it did anything, so this task has not been started.',
};

export function deadRunSentence({ engineWord = 'The agent', cause = 'unknown', runs = 1, resetsAt = null } = {}) {
  const opener = `${engineWord} ${DEAD_RUN_OPENERS[cause] ?? DEAD_RUN_OPENERS.unknown}`;

  const again = runs > 1 ? ` This has happened ${runs} times on this task.` : '';

  // THE TIME THE LIMIT PRINTED, when there is one. "when the limit resets"
  // leaves her with a question; "at 6pm" is an answer, and it is the CLI's own
  // word for it rather than anything we worked out.
  const next = cause === 'signed-out'
    ? ' Sign that account back in and it picks straight up.'
    : cause === 'org-blocked'
      ? ' Only an admin of that Claude workspace can turn it back on.'
      : cause === 'at-limit'
      ? (resetsAt ? ` It starts again on its own at ${resetsAt}.` : ' It starts again on its own when the limit resets.')
      : cause === 'interrupted'
        ? ` ${Name} runs it again on its own.`
        : ` ${Name} keeps trying, and it will keep failing the same way until this is fixed.`;

  return `${opener}${again}${next}`;
}

/* ------------- a run that finished and still delivered nothing ------------ */
// WHAT GOES ON HER ROW WHEN THE RUN WAS FINE AND HER ANSWER STILL WENT NOWHERE.
//
// `settleDelivery` is two independent tests joined with an AND: did the process
// exit cleanly, and did an agent leave a word on the row since the user wrote. A run
// can pass the first and fail the second, and several ordinary ones do -- a
// Codex turn that talks in its thread and never calls a store tool, a worker
// that claims a row and finishes without writing, any session on an install
// that ships no store MCP at all. That is precisely what the three delivery
// attempts exist for.
//
// But the writer at the end of those three attempts was `sayTheRunDied`, and it
// is gated on `saidNothingSheCanUse`, which is FALSE for a clean exit. So the
// third failure returned 'given up' and said nothing: the answered open row was
// neither settled nor handed back to her with a word on it, and it reads
// exactly like a row nobody has got to yet, forever, after she did something.
//
// IT IS NOT THE DEAD-RUN SENTENCE AND MUST NOT BE. Those five openers all say
// nothing ran; something ran here. Keeping this out of `DEAD_RUN_OPENERS` is
// also what keeps `deadRunCause` answering null for it, so a row carrying this
// is not counted among the ones nothing has started -- which would be a second
// wrong thing said about the same row.
//
// FIRST SENTENCE UNDER 112 CHARACTERS, the same budget the openers keep, because
// that is where her inbox row clips (SUMMARY_BUDGET, renderer/src/list-rules.ts).
export function undeliveredAnswerSentence({ engineWord = 'The agent', attempts = 1 } = {}) {
  const n = Math.max(1, Math.trunc(attempts ?? 1));
  const runs = n === 1 ? 'once and finished' : `${n} times and each run finished`;
  return `Your reply did not reach this task. ${engineWord} ran ${runs} without writing anything back on the row, so ${NAME} has stopped carrying it. Reply again and it goes to a fresh session.`;
}

// WHOSE SENTENCE IS ON THIS ROW, AND WHAT IT SAYS HAPPENED.
//
// It could not come up. The count behind that row is taken in
// `sayItOnEveryStrandedRow`, which skips any row it has already spoken on, and
// the row is normally spoken on by `sayTheRunDied` at the moment of the exit
// instead. The pass then saw a result newer than the run and read it as
// somebody having answered, which is exactly what it should read a WORKER'S
// result as, and it had no way to tell that the result was ours. Measured on
// her machine that night: 65 rows with dead runs recorded, 10 spoken on, and
// not one carrying a reason, so the count was zero every tick of its life.
//
// So a result is asked whose it is. Null means somebody wrote a real answer
// there and the row is not stranded; a cause means the last word on that row is
// still the app saying nothing ran.
export function deadRunCause(text) {
  const s = String(text ?? '');
  if (!s.trim()) return null;
  for (const [cause, opener] of Object.entries(DEAD_RUN_OPENERS)) {
    if (s.includes(opener)) return cause;
  }
  return null;
}

/* ---------------- one line per cause, for the looks above the list -------- */
// WHY A BREAKDOWN EXISTS AT ALL.
//
// `strandedSentence` above says ONE number for everything, and `strandedRemedy`
// gives up the moment two causes are in the pile: "They are not all stuck on
// the same thing. Each row says which." That is the app declining to say what
// the failures are in the one place she says they belong. On the evening she
// filed this row the pile was six at a limit that cleared itself in four
// minutes and four that could not clear themselves at all, and that sentence
// covered both with the same shrug.
//
// So the count is kept per cause. Every look that says more than one thing above
// the list is drawn off this, and no look invents a word: the phrases are here,
// once, so two surfaces cannot end up with two vocabularies.

// THE SHORT NAME OF THE CAUSE, in her nouns. Never the engine's words. Used
// where the shape has no room for a sentence, which is most of them.
export function causeWord(cause) {
  if (cause === 'signed-out') return 'a signed-out login';
  if (cause === 'org-blocked') return 'an organization that blocks Claude Code';
  if (cause === 'at-limit') return 'your Claude limit';
  if (cause === 'workspace') return 'a folder Claude will not run in';
  if (cause === 'interrupted') return 'runs getting cut off';
  return 'something we cannot name';
}

// WHAT IT IS, with the count in front of it, as one clause. The verb is chosen
// per cause because "waiting" is true of a limit and false of a login that has
// run out.
export function causeWhat(cause, count) {
  const n = Math.max(0, Math.trunc(count ?? 0));
  if (cause === 'signed-out') return `${n} stopped by a signed-out Claude login`;
  if (cause === 'org-blocked') return `${n} stopped by an organization that blocks Claude Code`;
  if (cause === 'at-limit') return `${n} waiting on your Claude limit`;
  if (cause === 'workspace') return `${n} in a folder Claude will not run in`;
  if (cause === 'interrupted') return `${n} cut off mid-run`;
  return `${n} stopped for a reason we cannot name`;
}

// WHAT HAPPENS NEXT, so no line on any of these looks is a dead end. The hour
// comes from the limit line the CLI printed, never from our own clock.
export function causeNext(cause, resetsAt = null) {
  if (cause === 'signed-out') return 'Type /login in a terminal and they pick straight up.';
  if (cause === 'org-blocked') return 'Ask an admin of that Claude workspace to turn Claude Code back on.';
  if (cause === 'at-limit') return resetsAt ? `They start again on their own at ${resetsAt}.` : 'They start again on their own when it resets.';
  if (cause === 'workspace') return 'Open the folder in Claude once and say yes to trusting it.';
  if (cause === 'interrupted') return `Nothing to do. ${Name} is trying them again.`;
  return `${Name} keeps trying on its own.`;
}

// THE ONE THING SHE COULD PRESS, or null when there is honestly nothing. Only
// the causes a person can end are given a word; a limit is not one of them, and
// putting a button on it would be the app pretending she has a move.
export function causeAct(cause) {
  if (cause === 'signed-out') return 'Sign in';
  if (cause === 'workspace') return 'Trust the folder';
  return null;
}

// THE PILE, GROUPED. Biggest first, and a cause she can end always outranks one
// she cannot at the same count, because the list is read top down and the top
// of it should be the part with a move in it.
export function causeBreakdown(rows = [], resetsAt = null) {
  const by = new Map();
  for (const r of rows) {
    const cause = r?.cause ?? 'unknown';
    by.set(cause, (by.get(cause) ?? 0) + 1);
  }
  return [...by.entries()]
    .map(([cause, count]) => ({
      cause,
      count,
      what: causeWhat(cause, count),
      next: causeNext(cause, cause === 'at-limit' ? resetsAt : null),
      act: causeAct(cause),
      hers: needsHerHands(cause) || cause === 'workspace',
    }))
    .sort((a, b) => (b.hers - a.hers) || (b.count - a.count) || a.cause.localeCompare(b.cause));
}
