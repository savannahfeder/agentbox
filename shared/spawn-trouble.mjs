// WHAT A DEAD SPAWN IS ALLOWED TO SAY ON HER SCREEN.
//
// The old rule was: take the last words of the session that died and print
// them. That is how she came to be reading "Agents are failing to start: done:
// Failed to authenticate: OAuth session expired and could not be refreshed"
// across the top of her inbox. Her three complaints were all correct. There is
// no OAuth in Agentbox, so the sentence names a thing that does not exist here.
// It is ugly. And it was on screen while agents were working perfectly well,
// because it was about one Claude account among several and not about the app.
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
// directory so there was no auth.json and the real ~/.codex login was neither
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
// It happens. A login can be intact, with the browser sign-in succeeding every
// time, while the WORKSPACE that account belongs to has Claude Code turned
// off. Run by hand, this is the whole of what the CLI says:
//
//   Your organization has disabled Claude subscription access for Claude Code ·
//   Use an Anthropic API key instead, or ask your admin to enable access
//
// "subscription access" is in the list below, so every one of those was filed
// as a login that had run out and the person was told to type /login. Doing
// it again and again changes nothing, because no login can change an admin's
// policy, and every dead run on the row carried "Sign that account back in
// and it picks straight up."
//
// TESTED BEFORE SIGNED_OUT, which is the whole of the fix: these lines say
// "subscription" and "access" and mean something else entirely.
//
// The API-key half of the CLI's sentence is never repeated to her. Workers bill
// to her subscription and never to a key (CLAUDE.md), so passing that advice on
// would be this app telling her to do the one thing it refuses to do.
import { NAME, Name } from '../shared/product-name.mjs';
import { harnessDefinition } from './harness-definitions.mjs';
import { instantIn, resetDay, wallIn } from './usage.mjs';

// A CLAUDE CODE TOO OLD FOR THE LINE AGENTBOX STARTS IT WITH. Its argument
// parser refuses the line before a single request, in one of two shapes,
// measured on npm releases 2.1.70 back to 1.0.90 (2026-10-15):
//
//   error: option '--permission-mode <mode>' argument 'auto' is invalid. ...
//   error: unknown option '--effort'
//
// ONLY FLAGS THE APP ITSELF SENDS, and only the mode value it sends. Somebody's
// own session arguments can carry a typo, and an update does not fix a typo,
// so an unknown flag of theirs stays 'unknown'. Anchored to the start of a
// line because that is where the CLI prints it, and an agent quoting the same
// words from some other program's output is not this.
const CLAUDE = harnessDefinition('claude');
const OUR_FLAGS = [
  ...JSON.stringify(CLAUDE.run).match(/--[A-Za-z-]+/g),
  '--allowedTools', '--disallowedTools', '--permission-mode', '--mcp-config', '--permission-prompt-tool', '--settings', '--model',
];
const TOO_OLD = [
  new RegExp(`^error: unknown option '(${OUR_FLAGS.join('|')})'`, 'm'),
  /^error: option '--permission-mode <mode>' argument 'auto' is invalid/m,
];
const ORG_BLOCKED = [
  /organi[sz]ation has disabled/i,
  /disabled for (your|this) organi[sz]ation/i,
  /ask your admin/i,
];

// A CODEX SIGNED IN WITH AN API KEY. Our own line, said before the worker
// starts (main/codex-account.mjs `codexKeyRefusal`), because Codex reads the
// key out of auth.json past the worker scrub and bills every call to it.
// Before SIGNED_OUT, whose /invalid api key/ is a different event.
const API_KEY = [/signed in with an api key/i];

// A CODEX config.toml CODEX WILL NOT READ. Codex's own words, off real runs of
// codex-cli 0.160.0 on 2026-10-15: the app-server refusing `config/read` for a
// quote left open or an old `profile = "..."` line, and the terminal's
// "Error loading config.toml". Not benched like a login: fixing the file
// changes no sign-in file, so a benched account would never come back.
const CODEX_CONFIG = [
  /refused config\/read: failed to (read configuration layers|resolve feature override)/i,
  /error loading config\.toml/i,
  /config\.toml:\d+:\d+: /i,
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
  // Claude Code 2.1.310's other refusals, which fell to 'unknown'
  // (tests/every-way-claude-code-says-its-login-ran-out-reads-as-signed-out).
  /login expired/i,
  /session has expired/i,
  /sign in again to continue/i,
  /\brun \/login\b/i,
];

// ANOTHER CLAUDE CODE REFRESHING THE SAME LOGIN, which the CLI calls
// transient. Before SIGNED_OUT, whose /oauth/ would bench the account for it.
const LOGIN_BUSY = [/another claude code process is refreshing/i];

// The server turning requests away for a moment, in Claude Code's words:
// "Server is temporarily limiting requests (not your usage limit)". Before
// AT_LIMIT, whose /usage limit/ would bench a plan that has room.
export const SERVER_BUSY = [/not your usage limit/i, /temporarily limiting requests/i];

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
  /econnreset|enotfound|etimedout|econnrefused|enetunreach|ehostunreach|eai_again/i,
  // Codex also prefixes non-network failures with "stream disconnected".
  // Match the request failure itself so incomplete responses keep their limit.
  /error sending request for url/i,
  /failed to send websocket request/i,
  // Node's fetch: a deadline passed (often while the Mac slept), or the request failed on the way.
  /aborted due to timeout/i,
  /\bfetch failed\b/i,
  /unable to connect/i,
  /can.{0,3}t reach the api/i,
  /timed out/i,
  /\b(429|500|502|503|529)\b/,
  /overloaded/i,
];

// A NETWORK THAT WILL NOT LET A SECURE CONNECTION THROUGH (2026-10-15).
//
// A company network that inspects TLS swaps in its own certificate, and a
// proxy can ask for a login. Neither clears by waiting, which is what made
// 'interrupted' the wrong home for them: the real Claude Code 2.1.301 behind a
// self-signed proxy died in 371 ms with "API Error: Unable to connect to API:
// Self-signed certificate detected (DEPTH_ZERO_SELF_SIGNED_CERT) ...", "unable
// to connect" filed it as a dropped connection, and the screen said there was
// nothing to do. Node's own spellings, Codex's (rustls and OpenSSL) and a
// proxy's 407 are here too. A REFUSED connection is not: "Connection refused
// — a firewall or proxy may be blocking it (ECONNREFUSED)" is also what an
// offline laptop prints.
//
// The fix is a setting the person's terminal already has, and since
// main/shell-path.mjs the app reads it from their shell profile at launch, so
// the sentence says to put it there and reopen the app.
const NETWORK = [
  /self[- ]signed certificate/i,
  /unable to get local issuer certificate/i,
  /unable to verify the first certificate/i,
  /\b(DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|UNABLE_TO_VERIFY_LEAF_SIGNATURE)\b/,
  /tls_untrusted_ca/i,
  /invalid peer certificate/i,
  /certificate verify failed/i,
  /proxy authentication required/i,
];
const NETWORK_FIX = 'export HTTPS_PROXY and NODE_EXTRA_CA_CERTS in your shell profile';

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

// A MODEL THE LOGIN'S PLAN DOES NOT INCLUDE. Not the account being out and not
// the model being unknown: the same login runs every other model, and another
// login on a bigger plan runs this one. Codex's own words, off two dead runs on
// 2026-10-09 and 2026-10-11 (codex-cli 0.160.0, a free-plan login handed
// gpt-6.1-sol): "The 'gpt-6.1-sol' model is not supported when using Codex with
// a ChatGPT account." The other two are ours, thrown before the thread starts
// by `codexModelRefusal`: this login's list lacks it, or no login's list here
// has it, which is what a paid plan that has ended looks like.
const MODEL_NOT_ON_PLAN = [
  /model is not supported when using codex with a chatgpt account/i,
  /not a model the plan of the codex account/i,
  /not a model the codex on this computer knows/i,
];

// Ours too, from `codexEffortRefusal`.
const LEVEL_NOT_OFFERED = [/not a level that model offers/i];

// Codex lets one process write to a conversation at a time, and refuses our
// resume while the Codex app or a terminal has it open. codex-cli 0.163.0:
// "thread <id> already has an active writer".
const OPEN_ELSEWHERE = [/already has an active writer/i];

// WHICH OF THE THREE THINGS WENT WRONG, from whatever the tool printed.
// 'unknown' is a first-class answer, not a failure: an honest generic sentence
// beats a confident wrong one.
export function troubleCause(raw) {
  const text = String(raw ?? '');
  if (!text.trim()) return 'unknown';
  // The CLI's own argument check, before any account is asked anything.
  if (TOO_OLD.some((re) => re.test(text))) return 'too-old';
  if (CODEX_CONFIG.some((re) => re.test(text))) return 'codex-config';
  if (API_KEY.some((re) => re.test(text))) return 'api-key';
  // FIRST, because an organization's refusal mentions the subscription and
  // reads as a signed-out login to the list below.
  if (ORG_BLOCKED.some((re) => re.test(text))) return 'org-blocked';
  // BEFORE SIGNED-OUT, because Codex's sentence says "ChatGPT account".
  if (MODEL_NOT_ON_PLAN.some((re) => re.test(text))) return 'model-not-on-plan';
  if (LEVEL_NOT_OFFERED.some((re) => re.test(text))) return 'level-not-offered';
  if (OPEN_ELSEWHERE.some((re) => re.test(text))) return 'open-elsewhere';
  if (LOGIN_BUSY.some((re) => re.test(text))) return 'interrupted';
  if (SERVER_BUSY.some((re) => re.test(text))) return 'interrupted';
  if (SIGNED_OUT.some((re) => re.test(text))) return 'signed-out';
  if (AT_LIMIT.some((re) => re.test(text))) return 'at-limit';
  // BEFORE WORKSPACE, whose /untrusted/ would read a certificate as a folder,
  // and before INTERRUPTED, whose "unable to connect" is in Claude Code's line.
  if (NETWORK.some((re) => re.test(text))) return 'network';
  if (WORKSPACE.some((re) => re.test(text))) return 'workspace';
  // LAST ON PURPOSE, so every text that already had a name keeps it. A dropped
  // connection is the weakest of the four claims: an account that is signed out
  // or capped often mentions a connection on the way down, and the account is
  // the fact worth saying.
  if (INTERRUPTED.some((re) => re.test(text))) return 'interrupted';
  return 'unknown';
}

// A SUBSCRIPTION THAT HAS ENDED IS REFUSED IN AN ADMIN'S WORDS. Claude Code
// 2.1.293 told a lapsed personal Max login "Your organization has disabled
// Claude subscription access for Claude Code" (2026-10-11), the same line a
// workspace policy prints, so the text alone cannot tell them apart. The
// login's own file can: `plan` is main/claude-plan.mjs's reading of it, and
// `ended` is its billing gone to "none". Anything else keeps its cause.
// A LOGIN THAT RAN OUT AND ONE NOBODY EVER MADE REFUSE IN THE SAME WORDS, and
// the second is what somebody who skipped setup meets: "Sign that account back
// in" about an account they never had. `everSignedIn` is the caller's reading
// of the login's own files; false only where that reading is proof.
export function refineCause(cause, plan, { everSignedIn = true } = {}) {
  if (cause === 'org-blocked' && plan?.ended) return 'subscription-ended';
  if (cause === 'signed-out' && !everSignedIn) return 'no-plan';
  return cause;
}

// THE CLOCK A LIMIT LINE NAMES, AND THE ZONE IT NAMED IT IN.
//
// The zone used to be dropped on the floor, on the assumption that the CLI
// prints the clock the Mac is already set to. A run on the cloud prints the
// cloud machine's: "resets 12:10am (UTC)" reached a Mac on Pacific time
// (2026-10-16), and both the hour on the row and the moment the fleet waited
// for were seven hours out. `offset` is minutes east of UTC, and null when
// the line printed no zone at all — which is still most lines, and still
// means local. This reads any offset, and reads it for the sentence as well
// as for the bench, which the first fix for that incident did not.
//
// Both wordings are real: the CLI's own line is "resets 6pm" and the API's is
// "Your weekly limit resets at 4pm", so the "at" is optional.
function resetClock(raw) {
  const m = /resets\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:\(\s*(?:UTC|GMT)\s*(?:([+-])(\d{1,2})(?::?(\d{2}))?)?\s*\))?/i
    .exec(String(raw ?? ''));
  if (!m) return null;
  const zoned = /\(\s*(?:UTC|GMT)/i.test(m[0]);
  return {
    h: (Number(m[1]) % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0),
    min: Number(m[2] ?? 0),
    offset: zoned ? (m[4] === '-' ? -1 : 1) * (Number(m[5] ?? 0) * 60 + Number(m[6] ?? 0)) : null,
  };
}

// The CLI's own wording for a clock time, so a converted hour reads exactly
// the way a quoted one always has.
function clockWords(h, min) {
  return `${h % 12 || 12}${min ? `:${String(min).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

// "3:15pm" today, "Wed 2:30pm" this week, "Wed Oct 28 1:05pm" further out,
// the same day words the account meters use.
function momentWords(ms, from) {
  const d = new Date(ms);
  const day = resetDay(ms, from);
  return `${day ? `${day} ` : ''}${clockWords(d.getHours(), d.getMinutes())}`;
}

// WHEN THE LIMIT LETS GO, IN THE CLOCK SHE IS LOOKING AT.
//
// carries the one thing she actually wants to know, and we were throwing it
// away and then telling her the vaguer "when the limit resets". A line that
// names its own zone is converted to this Mac's clock rather than quoted, so
// the hour on the row is an hour she can act on; a line that names none is
// already local and is quoted as it stands. Null when there is no time to
// quote, and then the sentence falls back to the wording that has always been
// there.
export function limitResetsAt(raw, from = Date.now()) {
  const clock = resetClock(raw);
  if (!clock) {
    // A reset on another day ("resets Oct 22 at 4pm", Codex's "try again at
    // Oct 28th, 2026 1:05 PM") has no bare hour to quote.
    const moment = limitResetMoment(raw, from);
    return moment == null ? null : momentWords(moment, from);
  }
  if (clock.offset == null) return clockWords(clock.h, clock.min);
  const at = new Date(limitResetMoment(raw, from));
  return clockWords(at.getHours(), at.getMinutes());
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const CLAUDE_DAY = /resets\s+([a-z]{3})[a-z]*\.?\s+(\d{1,2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:\(\s*([^)]+?)\s*\))?/i;
const UTC_ZONE = /^(?:UTC|GMT)\s*(?:([+-])(\d{1,2})(?::?(\d{2}))?)?$/i;

// "UTC", "GMT+2" or a place such as "America/Los_Angeles". A zone this
// computer cannot name, or none, is its own clock.
function zoneOf(word) {
  const utc = UTC_ZONE.exec(word ?? '');
  if (utc) return { offset: (utc[1] === '-' ? -1 : 1) * (Number(utc[2] ?? 0) * 60 + Number(utc[3] ?? 0)), name: null };
  return { offset: null, name: word && wallIn(Date.now(), word) ? word : null };
}

// The moment a dated Claude Code reset names, or null. The line has no year,
// so it is the year in that zone at `from`, or the next one when that puts the
// reset more than a day behind (December reading a January date).
function claudeResetDay(raw, from) {
  const m = CLAUDE_DAY.exec(String(raw ?? ''));
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  const day = Number(m[2]);
  const h = (Number(m[3]) % 12) + (m[5].toLowerCase() === 'pm' ? 12 : 0);
  const min = Number(m[4] ?? 0);
  const zone = zoneOf(m[6]);
  const at = (year) => zone.offset != null
    ? Date.UTC(year, month, day, h, min) - zone.offset * 60_000
    : instantIn(year, month, day, h, min, zone.name);
  const year = zone.offset != null
    ? new Date(from + zone.offset * 60_000).getUTCFullYear()
    : (wallIn(from, zone.name)?.year ?? new Date(from).getFullYear());
  const moment = at(year);
  return moment < from - 86_400_000 ? at(year + 1) : moment;
}

// THE SAME HOUR AS A MOMENT, so the fleet can wait exactly until it
// (a limit that reset at, say, 6:50pm could hold every agent until 7:03pm,
// because the app waited a fixed thirty minutes instead of reading this line).
// The next local occurrence of that clock time at or after `from`; null when
// the line names no hour.
export function limitResetMoment(raw, from = Date.now()) {
  // CODEX NAMES A DAY, NOT AN HOUR: "try again at Sep 28th, 2026 1:05 PM"
  // (codex-cli 0.153.4, 2026-09-24). A weekly limit read as "thirty minutes"
  // put the capped login back in the pool every half hour for days.
  const dated = /try again at ([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4}),? (\d{1,2}):(\d{2})\s*(am|pm)/i.exec(String(raw ?? ''));
  if (dated) {
    const month = MONTHS.indexOf(dated[1].slice(0, 3).toLowerCase());
    if (month >= 0) {
      const h = (Number(dated[4]) % 12) + (dated[6].toLowerCase() === 'pm' ? 12 : 0);
      return new Date(Number(dated[3]), month, Number(dated[2]), h, Number(dated[5]), 0, 0).getTime();
    }
  }
  // Claude Code names the day when the reset is not today: "resets Oct 22 at
  // 4pm (America/Los_Angeles)".
  const datedReset = claudeResetDay(raw, from);
  if (datedReset != null) return datedReset;
  const clock = resetClock(raw);
  if (!clock) return null;
  if (clock.offset == null) {
    const d = new Date(from);
    d.setHours(clock.h, clock.min, 0, 0);
    if (d.getTime() < from - 60_000) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  // The named zone's own calendar day is not this Mac's, so the candidate is
  // built in UTC and then walked to the one occurrence that sits in the next
  // twenty-four hours. The grace is for the two clocks disagreeing by seconds.
  const asked = new Date(from);
  let t = Date.UTC(asked.getUTCFullYear(), asked.getUTCMonth(), asked.getUTCDate(), clock.h, clock.min) - clock.offset * 60_000;
  while (t < from - 60_000) t += 86_400_000;
  while (t - from >= 86_400_000) t -= 86_400_000;
  return t;
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
  // An out-of-date Claude Code is hers too: no retry updates it, and every run
  // until she does spends nothing but a reply's tries.
  // A Codex signed in with a key is hers as well, and `codex login` rewrites
  // auth.json, which is what brings a benched account back.
  return cause === 'signed-out' || cause === 'no-plan' || cause === 'org-blocked' || cause === 'subscription-ended' || cause === 'too-old' || cause === 'api-key';
}

// THE ONE COMMAND THAT UPDATES IT, WHEREVER IT CAME FROM. `claude update`
// updates a native install itself and, on a Homebrew one, prints the brew line
// to run instead (read in 2.1.80's own code), so it is the right first thing
// to type whatever she installed it with.
const UPDATE = `run claude update in a terminal (${Name} needs version ${CLAUDE.minVersion} or newer)`;

// WHAT SHE READS WHEN NOT ONE AGENT CAN START ANYWHERE.
// Not "an error occurred". The subject of the sentence is the thing she cares
// about, which is her agents, and the reason follows it in plain words.
export function troubleSentence(cause) {
  if (cause === 'signed-out') return 'No agents can start. Your Claude login has run out.';
  if (cause === 'no-plan') return 'No agents can start. No AI plan is set up on this computer.';
  if (cause === 'org-blocked') return 'No agents can start. Your organization has turned Claude Code off.';
  if (cause === 'subscription-ended') return 'No agents can start. Your Claude subscription has ended.';
  if (cause === 'at-limit') return 'No agents can start. Your Claude plan is at its limit.';
  if (cause === 'workspace') return 'No agents can start. Claude will not run in this folder.';
  if (cause === 'interrupted') return 'No agents can start. The connection to Claude keeps dropping.';
  if (cause === 'network') return 'No agents can start. This network will not let them connect securely.';
  if (cause === 'too-old') return 'No agents can start. Claude Code on this computer is too old.';
  return 'No agents can start on this computer right now.';
}

// THE SECOND LINE: what happens next, so the first line is never a dead end.
// A sentence that only names a problem makes her go and find out whether she
// is meant to do something; these say it.
export function troubleRemedy(cause) {
  // ). "Sign in to Claude again" is a thing to go and work out; /login is a
  // thing to type.
  if (cause === 'signed-out') return 'Open Claude in a terminal, type /login, and they pick straight back up.';
  if (cause === 'no-plan') return `Set one up ${SET_UP_A_PLAN} and they pick straight up.`;
  if (cause === 'org-blocked') return 'Ask an admin of that Claude workspace to turn Claude Code back on.';
  if (cause === 'subscription-ended') return 'Renew it at claude.ai and they pick straight up.';
  if (cause === 'at-limit') return 'They start again on their own when it resets.';
  if (cause === 'workspace') return 'Open the folder in Claude once and say yes to trusting it.';
  if (cause === 'interrupted') return `Nothing to do. ${Name} tries them again on its own.`;
  if (cause === 'network') return `If your company uses a proxy or its own certificate, ${NETWORK_FIX} and reopen ${Name}.`;
  if (cause === 'too-old') return `To update it, ${UPDATE}. They start again on their own.`;
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
  if (cause === 'subscription-ended') return 'Signed in, but its Claude subscription has ended. Renew it at claude.ai to use this account again.';
  if (cause === 'at-limit') return 'At its limit. Agents start again on their own when it resets.';
  if (cause === 'workspace') return 'Claude would not run in the folder this was asked to work in.';
  if (cause === 'interrupted') return `Its runs keep getting cut off. ${Name} is trying them again.`;
  // NOT THE ACCOUNT, and said so, because this is the page where she would
  // otherwise go and sign it in again.
  if (cause === 'network') return `The account is fine; this network will not let it connect securely. Set your company's proxy or certificate in your shell profile and reopen ${Name}.`;
  // Not this account either: every account here runs the same Claude Code.
  if (cause === 'too-old') return `Claude Code on this computer is too old. To update it, ${UPDATE}.`;
  // A cause we cannot name points at the account, not at the app (2026-10-11).
  return 'Claude Code would not start on this account. Check that its plan is active at claude.ai.';
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
  if (cause === 'network') return `${engineWord} cannot connect securely through this network, so its tasks are not moving. Set your company's proxy or certificate in your shell profile and reopen ${Name}.`;
  if (cause === 'api-key') return `${engineWord} is signed in with an API key, which ${Name} never bills, so nothing runs on it. Open a terminal, run codex login, and sign in with ChatGPT.`;
  if (cause === 'codex-config') return `${engineWord} could not read its config.toml, so nothing runs on it. Run codex in a terminal to see the line it points at, and fix it.`;
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
// once. That is why the screen could stay quiet: Codex tasks and tasks on a
// signed-out login could sit there all day while the other agents worked, so the
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
  'subscription-ended': "cannot run because that account's Claude subscription has ended, so nothing has been done.",
  'at-limit': 'is at its usage limit, so nothing has been done on this task.',
  interrupted: 'was cut off in the middle, so nothing has been done on this task.',
  'model-not-on-plan': "could not use this task's model on that account's plan, so nothing has been done.",
  'level-not-offered': "could not run this task's model at the thinking level it asks for, so nothing has been done.",
  network: 'could not connect securely through this network, so nothing has been done on this task.',
  'too-old': `on this computer is older than ${Name} needs, so nothing has been done on this task.`,
  'api-key': `is signed in with an API key, which ${Name} never bills, so nothing has been done.`,
  'codex-config': 'could not read its config.toml, so nothing has been done on this task.',
  'open-elsewhere': 'has this conversation open in another window, so nothing has been done here.',
  // THE ONE OPENER WITH NO ENGINE IN FRONT OF IT: somebody who has set nothing
  // up has never heard of Codex, and the plan screens never say the word.
  'no-plan': 'No AI plan is set up on this computer, so nothing has been done on this task.',
  unknown: 'stopped before it did anything, so this task has not been started.',
};

// WHERE A PLAN GETS SET UP: the bar across the top of the inbox (`PlanBar`),
// which is the only way back into setup. Said once, for the four places that
// point at it.
const SET_UP_A_PLAN = 'at the top of your inbox';

// The same, for a run that used a tool before it died, so "nothing has been
// done" would be false. Kept out of DEAD_RUN_OPENERS so `deadRunCause` does
// not count the row among those nothing has started on. A cause missing here
// can only stop a run before its first tool, so on a run that worked it is a
// misreading and gets the plain line.
const WORKED_OPENERS = {
  'signed-out': 'was signed out partway through, so this task is not finished.',
  'org-blocked': 'was switched off for that account partway through, so this task is not finished.',
  'subscription-ended': "stopped partway through because that account's subscription ended.",
  'at-limit': 'hit its usage limit partway through, so this task is not finished.',
  interrupted: 'was cut off partway through, so this task is not finished.',
  network: 'lost its secure connection partway through, so this task is not finished.',
  unknown: 'stopped partway through and did not finish this task.',
};

/**
 * THE LINE IN A THREAD WHERE A RUN STOPPED, in our words.
 *
 * The CLI types its own refusal into the run as if the agent had said it
 * ("Failed to authenticate: OAuth session expired..."), and the thread drew it
 * as the agent's message. This is about one run, not the task: a run that
 * stops mid-thread has usually done plenty before it, so it says nothing about
 * what has or has not been done.
 */
const RUN_STOPPED = {
  'signed-out': 'This run stopped because the account was signed out.',
  // Same refusal text for an admin's block and an ended subscription, and this
  // line has only the text, so it says what is true of both.
  'org-blocked': 'This run stopped because Claude Code will not run on that account.',
  'at-limit': 'This run stopped because the account hit its usage limit.',
  workspace: "This run stopped because it would not start in this project's folder.",
  interrupted: 'This run was cut off in the middle.',
  'model-not-on-plan': "This run stopped because that account's plan does not include the model.",
  'level-not-offered': 'This run stopped because the model does not offer that thinking level.',
  network: 'This run stopped because this network would not let it connect securely.',
  'too-old': `This run stopped because Claude Code on this computer is older than ${Name} needs.`,
  'api-key': 'This run stopped because Codex is signed in with an API key.',
  'codex-config': 'This run stopped because Codex could not read its config.toml.',
  'open-elsewhere': 'This run stopped because the conversation is open in another Codex window.',
  unknown: 'This run stopped before it finished.',
};

export function runStoppedLine(raw) {
  return RUN_STOPPED[troubleCause(raw)] ?? RUN_STOPPED.unknown;
}

// A cause we cannot name still has a likeliest culprit, and it is the agent's
// plan, not the app (2026-10-19). Engines with no plan to point at get none.
const UNNAMED_CHECK = {
  Codex: 'Check that your ChatGPT plan is active at chatgpt.com, or run codex in a terminal to see what it says. ',
  'Claude Code': 'Check that your Claude plan is active at claude.ai, or run claude in a terminal to see what it says. ',
};

// Named on a limit, because with the cloud on "its usage limit" read as the
// cloud's hours.
const PLAN_WORD = { Codex: 'ChatGPT plan', 'Claude Code': 'Claude plan' };

function limitNext(engineWord, resetsAt) {
  const plan = PLAN_WORD[engineWord];
  if (!plan) return resetsAt ? ` It starts again on its own at ${resetsAt}.` : ' It starts again on its own when the limit resets.';
  return resetsAt
    ? ` It starts again on its own at ${resetsAt}, when your ${plan}'s limit resets.`
    : ` It starts again on its own when your ${plan}'s limit resets.`;
}

function dayWords(ms) {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// What to do before replying to a thread the app has stopped trying on, in the
// same words `deadRunSentence` uses for each cause. Null when the reply is all.
function fixBeforeReplying({ cause, engineWord, resetsAt, model, planEnded }) {
  if (cause === 'signed-out') return 'Sign that account back in.';
  if (cause === 'no-plan') return `Set up a plan ${SET_UP_A_PLAN}.`;
  if (cause === 'org-blocked') return 'Only an admin of that Claude workspace can turn it back on.';
  if (cause === 'subscription-ended') return 'Renew it at claude.ai.';
  if (cause === 'at-limit') {
    const plan = PLAN_WORD[engineWord];
    if (!resetsAt) return plan ? `Wait for your ${plan}'s limit to reset.` : 'Wait for the limit to reset.';
    return plan ? `Your ${plan}'s limit resets at ${resetsAt}.` : `The limit resets at ${resetsAt}.`;
  }
  if (cause === 'too-old') return `To update it, ${UPDATE}.`;
  if (cause === 'api-key') return 'Run codex login in a terminal to sign in with your ChatGPT plan.';
  if (cause === 'codex-config') return 'Run codex in a terminal to see the line it points at and fix it.';
  if (cause === 'open-elsewhere') return 'Close it there.';
  if (cause === 'model-not-on-plan') {
    return planEnded
      ? `That account's ChatGPT subscription ended on ${dayWords(planEnded)}, and the free plan does not include ${model || 'this model'}. Renew it at chatgpt.com, or pick another model for this task.`
      : 'Pick another model for this task.';
  }
  if (cause === 'level-not-offered') return 'Pick another thinking level for this task.';
  if (cause === 'network') return `If your company uses a proxy or its own certificate, ${NETWORK_FIX} and reopen ${Name}.`;
  if (cause === 'workspace') return `Open this project's folder in ${engineWord} once and say yes to trusting it.`;
  if (cause === 'unknown') return UNNAMED_CHECK[engineWord]?.trim() || null;
  return null;
}

// NO SENTENCE HERE OFFERS ANOTHER ACCOUNT (w-dac993a554). There used to be an
// `elsewhere` flag: another signed-in login had room, or had the model, so the
// line promised the move instead of the wait. Nothing moves work between
// accounts any more, so a limit is named with the hour it resets and a model no
// plan includes is answered with another model.
//
// `planEnded` is when the account's paid ChatGPT plan ended (main/codex-account.mjs
// `codexPlanEnded`), which is why its list lacks `model`.
//
// `gaveUp` is the app having stopped carrying a reply (`settleDeliveryAndSay`).
// Nothing restarts the thread until somebody replies or resumes it, so the
// sentence asks for that and promises nothing of its own.
// `account` is the login this run was spending, already in words
// (shared/account-names.mjs). It is null on a Mac with one login, where naming
// it tells nobody anything, and then every sentence here is the one it has
// always been. There is no `instead`: nothing takes the task to another login
// (w-dac993a554), so a limit is named and waited out.
//
// `partway` is a run that was picking up a thread an earlier run worked on: it
// may have done nothing itself, but the task has been started. A cause with no
// partway words stopped this run before it began, and keeps its own opener.
//
// `retryAt` is when the rest ladder starts it again (`restingUntil` in
// main/supervisor.mjs), named only on the causes that wait for nothing else.
//
// `slept` is this computer having slept while the run was up. A run that named no
// cause of its own was cut off by that, and says so.
export function deadRunSentence({ engineWord = 'The agent', cause = 'unknown', runs = 1, resetsAt = null, worked: usedATool = false, partway = false, model = null, planEnded = null, gaveUp = false, account = null, retryAt = null, slept = false, now = Date.now() } = {}) {
  if (usedATool && !WORKED_OPENERS[cause]) cause = 'unknown';
  const asleep = slept && (cause === 'interrupted' || cause === 'unknown');
  if (asleep) cause = 'interrupted';
  const worked = usedATool || (partway && !!WORKED_OPENERS[cause]);
  // A LIMIT IS A FACT ABOUT ONE LOGIN, so that is the one cause whose opener
  // takes the name. The others are about the tool or the task.
  const limitOpener = cause === 'at-limit' && account
    ? (worked
      ? `hit its usage limit on ${account} partway through, so this task is not finished.`
      : `is at its usage limit on ${account}, so nothing has been done on this task.`)
    : null;
  const sleptOpener = asleep
    ? `was cut off when this computer went to sleep, so ${worked ? 'this task is not finished.' : 'nothing has been done on this task.'}`
    : null;
  const opener = cause === 'no-plan'
    ? DEAD_RUN_OPENERS['no-plan']
    : `${engineWord} ${sleptOpener ?? limitOpener ?? (worked ? WORKED_OPENERS[cause] ?? WORKED_OPENERS.unknown : DEAD_RUN_OPENERS[cause] ?? DEAD_RUN_OPENERS.unknown)}`;

  const again = runs > 1 ? ` This has happened ${runs} times on this task.` : '';

  if (gaveUp) {
    const fix = fixBeforeReplying({ cause, engineWord, resetsAt, model, planEnded });
    return `${opener}${again} ${fix ? `${fix} Then reply` : 'Reply'} here to start it again.`;
  }

  const when = retryAt > now ? ` at ${momentWords(retryAt, now)}` : '';
  // THE TIME THE LIMIT PRINTED, when there is one. "when the limit resets"
  // leaves her with a question; "at 6pm" is an answer, and it is the CLI's own
  // word for it rather than anything we worked out.
  const next = cause === 'signed-out'
    ? ' Sign that account back in and it picks straight up.'
    : cause === 'no-plan'
      ? ` Set one up ${SET_UP_A_PLAN} and it picks straight up.`
    : cause === 'org-blocked'
      ? ' Only an admin of that Claude workspace can turn it back on.'
      : cause === 'subscription-ended'
      ? ' Renew it at claude.ai and it picks straight up.'
      : cause === 'at-limit'
      ? limitNext(engineWord, resetsAt)
      : cause === 'too-old'
      ? ` To update it, ${UPDATE}, and it starts again on its own.`
      : cause === 'api-key'
      ? ' Run codex login in a terminal to sign in with your ChatGPT plan, and it picks straight up.'
      : cause === 'codex-config'
      ? ` Run codex in a terminal to see the line it points at and fix it; ${Name} tries again on its own.`
      : cause === 'open-elsewhere'
      ? ` Close it there and ${Name} tries again on its own.`
      : cause === 'interrupted'
        ? ` ${Name} runs it again on its own${when}.`
        : cause === 'model-not-on-plan'
          ? (planEnded
            ? ` That account's ChatGPT subscription ended on ${dayWords(planEnded)}, and the free plan does not include ${model || 'this model'}. Renew it at chatgpt.com, or pick another model for this task.`
            : ' Pick another model for this task.')
        : cause === 'level-not-offered'
          ? ' Pick another thinking level for this task and it will run.'
        : cause === 'network'
          ? ` It will keep failing until this is fixed: if your company uses a proxy or its own certificate, ${NETWORK_FIX} and reopen ${Name}.`
        : worked
          ? ` ${Name} tries it again on its own${when}.`
        : cause === 'workspace'
          ? ` ${Name} keeps trying, and it will keep failing the same way until this is fixed.`
        : ` ${UNNAMED_CHECK[engineWord] ?? ''}${Name} tries again on its own${when}.`;

  return `${opener}${again}${next}`;
}

// Whether `deadRunSentence` tells her the app runs the task again by itself.
// The fresh-work pass keeps a row in the queue on exactly these, so a row is
// never promised a retry and then read as an answer waiting on her.
export function deadRunPromisesARetry({ cause = 'unknown', gaveUp = false } = {}) {
  if (gaveUp) return false;
  return cause !== 'org-blocked' && cause !== 'level-not-offered' && cause !== 'model-not-on-plan';
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
  return `${UNDELIVERED} ${engineWord} ran ${runs} without writing anything back on the row, so ${NAME} has stopped carrying it. Reply again and it goes to a fresh session.`;
}

const UNDELIVERED = 'Your reply did not reach this task.';

// A THREAD THE APP STOPPED STARTING (`_noteHowTheRunStarted` in
// main/supervisor.mjs). `tries` is how many times it has tried again on its
// own since, and `next` when it tries again, null once it has stopped trying.
const STOPPED_STARTING = `${Name} stopped starting this thread`;
const clock = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, '');

export function stoppedStartingSentence({ starts = 6, minutes = 10, tries = 0, triedAt = null, said = null, next = null } = {}) {
  const what = tries === 0
    ? `It was started ${starts} times in ${minutes} minutes, and each run ended before its agent began.`
    : tries === 1
      ? `It tried again on its own${triedAt ? ` at ${clock(triedAt)}` : ''}, and that run ended before its agent began too.`
      : `It tried again on its own ${tries === 2 ? 'twice' : `${tries} times`}, and each run ended before its agent began.`;
  const last = said ? ` The last one said "${said.slice(0, 300)}".` : '';
  const then = next ? ` It tries again on its own at ${clock(next)}. Reply here to try again now.` : ' Reply here to try again.';
  return `${STOPPED_STARTING}. ${what}${last}${then}`;
}

// THE APP'S OWN WORD THAT A RUN GOT NOWHERE: a dead-run sentence, from a run
// that used a tool or one that did not, the reply that never landed, or a
// thread it stopped starting. On a thread carrying a reply, each is written
// only once nothing will carry the reply on its own, so that thread waits on a
// person (`gaveUpOnTheAnswer`, renderer/src/list-rules.ts).
const DEAD_RUN_HALVES = {
  'at-limit': ['is at its usage limit', 'so nothing has been done on this task.'],
};

export function saysARunGotNowhere(text) {
  const s = String(text ?? '');
  if (!s.trim()) return false;
  if (deadRunCause(s)) return true;
  if (Object.values(WORKED_OPENERS).some((opener) => s.includes(opener))) return true;
  return s.startsWith(UNDELIVERED) || s.startsWith(STOPPED_STARTING);
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
//
// A NAMED LOGIN SITS INSIDE ONE OPENER ("is at its usage limit on
// alex@acme.com, so nothing has been done"), so that one is read back by its
// two halves. Without this a row stopped counting as one nothing had run on
// the moment it said which account was spent.
export function deadRunCause(text) {
  const s = String(text ?? '');
  if (!s.trim()) return null;
  for (const [cause, opener] of Object.entries(DEAD_RUN_OPENERS)) {
    if (s.includes(opener)) return cause;
  }
  for (const [cause, halves] of Object.entries(DEAD_RUN_HALVES)) {
    if (halves.every((half) => s.includes(half))) return cause;
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
  if (cause === 'no-plan') return 'no plan to run on';
  if (cause === 'org-blocked') return 'an organization that blocks Claude Code';
  if (cause === 'subscription-ended') return 'an ended Claude subscription';
  if (cause === 'at-limit') return 'your Claude limit';
  if (cause === 'workspace') return 'a folder Claude will not run in';
  if (cause === 'interrupted') return 'runs getting cut off';
  if (cause === 'model-not-on-plan') return "a model the account's plan does not include";
  if (cause === 'level-not-offered') return 'a thinking level its model does not offer';
  if (cause === 'network') return 'a network that blocks secure connections';
  if (cause === 'too-old') return 'an out-of-date Claude Code';
  if (cause === 'open-elsewhere') return 'a conversation open in another Codex window';
  return 'something we cannot name';
}

// WHAT IT IS, with the count in front of it, as one clause. The verb is chosen
// per cause because "waiting" is true of a limit and false of a login that has
// run out.
export function causeWhat(cause, count) {
  const n = Math.max(0, Math.trunc(count ?? 0));
  if (cause === 'signed-out') return `${n} stopped by a signed-out Claude login`;
  if (cause === 'no-plan') return `${n} waiting on a plan to run on`;
  if (cause === 'org-blocked') return `${n} stopped by an organization that blocks Claude Code`;
  if (cause === 'subscription-ended') return `${n} stopped by an ended Claude subscription`;
  if (cause === 'at-limit') return `${n} waiting on your Claude limit`;
  if (cause === 'workspace') return `${n} in a folder Claude will not run in`;
  if (cause === 'interrupted') return `${n} cut off mid-run`;
  if (cause === 'model-not-on-plan') return `${n} asking for a model no signed-in Codex plan includes`;
  if (cause === 'level-not-offered') return `${n} asking for a thinking level its model does not offer`;
  if (cause === 'network') return `${n} stopped by a network that blocks secure connections`;
  if (cause === 'too-old') return `${n} stopped by an out-of-date Claude Code`;
  if (cause === 'open-elsewhere') return `${n} open in another Codex window`;
  return `${n} stopped for a reason we cannot name`;
}

// WHAT HAPPENS NEXT, so no line on any of these looks is a dead end. The hour
// comes from the limit line the CLI printed, never from our own clock.
export function causeNext(cause, resetsAt = null) {
  if (cause === 'signed-out') return 'Type /login in a terminal and they pick straight up.';
  if (cause === 'no-plan') return `Set one up ${SET_UP_A_PLAN}.`;
  if (cause === 'org-blocked') return 'Ask an admin of that Claude workspace to turn Claude Code back on.';
  if (cause === 'subscription-ended') return 'Renew it at claude.ai and they pick straight up.';
  if (cause === 'at-limit') return resetsAt ? `They start again on their own at ${resetsAt}.` : 'They start again on their own when it resets.';
  if (cause === 'workspace') return 'Open the folder in Claude once and say yes to trusting it.';
  if (cause === 'interrupted') return `Nothing to do. ${Name} is trying them again.`;
  if (cause === 'model-not-on-plan') return 'Pick another model on each.';
  if (cause === 'level-not-offered') return 'Pick another thinking level on each.';
  if (cause === 'network') return troubleRemedy('network');
  if (cause === 'too-old') return troubleRemedy('too-old');
  if (cause === 'open-elsewhere') return 'Close them in the other Codex window.';
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
      hers: needsHerHands(cause) || cause === 'workspace' || cause === 'model-not-on-plan' || cause === 'level-not-offered' || cause === 'network' || cause === 'open-elsewhere',
    }))
    .sort((a, b) => (b.hers - a.hers) || (b.count - a.count) || a.cause.localeCompare(b.cause));
}
