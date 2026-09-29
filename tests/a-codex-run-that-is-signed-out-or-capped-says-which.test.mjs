// TWO CLASSIFIER PATTERN SETS THAT HAD NEVER BEEN MEASURED AGAINST CODEX.
//
// `shared/spawn-trouble.mjs` heads `SIGNED_OUT` and `AT_LIMIT` with "the shapes
// the CLAUDE CLI uses". The `WORKSPACE` set below them was measured against
// Codex on 2026-08-27 and carries the sentence it measured; these two never
// were. A miss there is not free: a rate-limited run filed 'unknown' draws "it
// will keep failing the same way until this is fixed", which for a limit is
// actively false -- it clears itself, at a time the tool prints on the line.
//
// SO THEY WERE MEASURED, on this Mac, 2026-09-05, against codex-cli 0.148.0 at
// /opt/homebrew/bin/codex. The findings are below, each beside the assertion it
// produced, and the headline is that NO NEW ENGLISH-WORDING REGEX WAS ADDED:
// both sets already cover what Codex says. A guessed regex is worse than an
// honest gap, and the honest gap is written down at the foot of this file.
//
// ---------------------------------------------------------------------------
// (1) SIGNED OUT: MEASURED DIRECTLY, ON A REAL RUN.
//
// `codex app-server` was driven the way main/codex-app-server.mjs drives it --
// initialize, thread/start, turn/start -- with `CODEX_HOME` pointed at an empty
// scratch directory, so there was no auth.json and the real ~/.codex login was
// neither read nor written. The turn retried five times over WebSocket, fell
// back to HTTPS, retried five more, and failed. What arrives is a
// `turn/completed` with `status: "failed"` and `error.message`:
//
// unexpected status 401 Unauthorized: Missing bearer or basic authentication in
// header, url: https://api.openai.com/v1/responses, cf-ray:
//
// That is the string `troubleText` turns into the stderr line the classifier
// reads, and `/unauthoriz/i` -- already in SIGNED_OUT -- matches it. The set was
// right about Codex without ever having been pointed at it.
//
// NOTE WHAT IT IS *NOT*: the friendly "run codex login" sentence. The app-server
// hands through the RAW HTTP text. That fact is what the gap at the foot of this
// file rests on.
//
// ---------------------------------------------------------------------------
// (2) AT LIMIT: COULD NOT BE PROVOKED, SO IT WAS READ OFF THE BINARY.
//
// A usage limit cannot be reached on purpose without spending her real
// subscription, and there is no flag that fakes one. So the limit wording was
// taken from the shipped binary instead, with `strings` over
// /opt/homebrew/Caskroom/codex/0.148.0/bin/codex. Codex's own limit sentences,
// verbatim, are the fixtures below -- and every one is already matched by a
// pattern that is in AT_LIMIT today.
//
// ---------------------------------------------------------------------------
// (3) AND THE PART THAT IS NOT WORDING AT ALL.
//
// `codex app-server generate-json-schema` (the binary's own generator, run on
// this Mac) defines `TurnError` as `{ message, additionalDetails,
// codexErrorInfo }`, and `CodexErrorInfo` as an enum whose members include
// `usageLimitExceeded`, `unauthorized`, `contextWindowExceeded` and
// `sessionBudgetExceeded`. That is a STRUCTURAL discriminator, published by the
// vendor, and `troubleText` was throwing it away and classifying prose.
//
// It is carried into the line now, in front, where the 300-character window
// `noteExitForBackoff` reads cannot cut it off. The two patterns added to
// spawn-trouble match those enum tokens and nothing else. They are not guesses
// about English: they are names out of a schema generated from the binary that
// is installed.
//
// ---------------------------------------------------------------------------
// THE GAP THAT IS STILL OPEN, SAID PLAINLY.
//
// The signed-out run proved the app-server can surface raw HTTP text rather
// than Codex's own sentence. That was NOT measured and no pattern was invented
// for it. The structured code above is the reason it is unlikely rather than
// the proof that it cannot happen: a run reaching that shape carries
// `usageLimitExceeded` and is caught.

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { troubleCause } from '../shared/spawn-trouble.mjs';
import { createCodexAppServer } from '../main/codex-app-server.mjs';
import { createCodexWorker } from '../main/codex-session.mjs';

/* ===================== (1) the signed-out run, verbatim =================== */

// Copied off the failing turn, not retyped from memory. The trailing ids are
// per-request and are cut here because nothing reads them; everything the
// classifier can see is to the left of them.
const SIGNED_OUT_401 = 'unexpected status 401 Unauthorized: Missing bearer or basic '
  + 'authentication in header, url: https://api.openai.com/v1/responses, '
  + 'cf-ray: a35fee511c9da893-TBS, request id: req_5a330cc105914c0c9bbda0935aa4ad10';

// The wording on the earlier attempts of the same run, which differ.
const SIGNED_OUT_UNKNOWN = 'unexpected status 401 Unauthorized: Unknown error, '
  + 'url: wss://api.openai.com/v1/responses, cf-ray: a35fecff4b7eda09-TBS';

// The app-server's own tracing line, which is what `onClosed` says when the
// shared process dies rather than the turn.
const SIGNED_OUT_TRACE = 'ERROR codex_api::endpoint::responses_websocket: failed to connect '
  + 'to websocket: HTTP error: 401 Unauthorized, url: wss://api.openai.com/v1/responses';

describe('a codex run on a login that is not signed in', () => {
  for (const [what, text] of [
    ['the failed turn', SIGNED_OUT_401],
    ['an earlier attempt in the same run', SIGNED_OUT_UNKNOWN],
    ['the app-server tracing tail', SIGNED_OUT_TRACE],
  ]) {
    it(`is signed-out, from ${what}`, () => {
      expect(troubleCause(text)).toBe('signed-out');
    });
  }

  // AND IT OUTRANKS THE CONNECTION READING, which is the trap: every one of
  // those strings is about a socket, and INTERRUPTED would happily claim them.
  // SIGNED_OUT is asked first for exactly this reason, and a limit that
  // mentions a connection on the way down is the same argument.
  it('is not read as a dropped connection', () => {
    expect(troubleCause(SIGNED_OUT_TRACE)).not.toBe('interrupted');
  });

  // A SIGNED-OUT LOGIN LEAVES THE ROTATION ON THE FIRST SIGHTING rather than
  // the third, which is what the classification is for.
  it('is a cause only she can end', async () => {
    const { needsHerHands } = await import('../shared/spawn-trouble.mjs');
    expect(needsHerHands(troubleCause(SIGNED_OUT_401))).toBe(true);
  });
});

/* ============== (2) codex's own limit sentences, off the binary =========== */

describe("a codex run against openai's limits", () => {
  // Each of these is a literal string in codex-cli 0.148.0.
  for (const said of [
    "You've hit your usage limit.",
    "You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits",
    "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits",
    "You've hit your usage limit. To get more access now, send a request to your admin",
    'Usage limit reached. You\'ve reached your usage limit. Increase your limits to continue using codex.',
    "You're out of credits. Your workspace is out of credits. Add credits to continue using Codex.",
    'rate limit exceeded',
  ]) {
    it(`is at-limit: ${said.slice(0, 48)}`, () => {
      expect(troubleCause(said)).toBe('at-limit');
    });
  }
});

/* ================= (3) the structured code, off the schema ================ */

describe("the code codex puts on the error rather than in the sentence", () => {
  it('reads usageLimitExceeded as a limit, whatever the prose says', () => {
    // The prose here is deliberately one nothing else would catch, so the
    // assertion is about the code and not about the words beside it.
    expect(troubleCause('usageLimitExceeded: the turn did not finish')).toBe('at-limit');
  });

  it('reads unauthorized as signed out', () => {
    expect(troubleCause('unauthorized: the turn did not finish')).toBe('signed-out');
  });

  // THE CASES THAT MUST NOT MATCH, and they are the reason this is two narrow
  // tokens rather than a rule about the word "exceeded". Neither of these is
  // her subscription: one is the model's context window and one is a per-run
  // budget somebody set. Filing either as 'at-limit' would tell her to wait for
  // a reset that is never coming.
  for (const code of ['contextWindowExceeded', 'sessionBudgetExceeded']) {
    it(`does not read ${code} as her limit`, () => {
      expect(troubleCause(`${code}: the turn did not finish`)).not.toBe('at-limit');
    });
  }

  // And a plain turn with no code and no words is still honestly unknown.
  it('leaves a nameless failure unknown', () => {
    expect(troubleCause('the turn failed')).toBe('unknown');
  });
});

/* ============ and the code really reaches the pipe that reads it ========== */

function fakeCodex() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const sent = [];
  const stdin = new EventEmitter();
  stdin.write = (chunk, cb) => {
    for (const line of String(chunk).split('\n')) if (line.trim()) sent.push(JSON.parse(line));
    cb?.(null);
    return true;
  };
  stdin.end = vi.fn();
  child.stdin = stdin;
  child.kill = vi.fn(() => true);
  const emit = (text) => child.stdout.emit('data', Buffer.from(text));
  return {
    child,
    say: (msg) => emit(`${JSON.stringify(msg)}\n`),
    idOf: (method) => sent.find((m) => m.method === method)?.id,
  };
}

const tick = () => new Promise((resolve) => { setTimeout(() => setImmediate(resolve), 0); });
const settle = async () => { for (let i = 0; i < 6; i += 1) await new Promise((r) => { setImmediate(r); }); };

const failedTurn = async (error) => {
  const codex = fakeCodex();
  const client = createCodexAppServer({ transport: codex.child });
  const worker = createCodexWorker({ server: client, ready: client.initialize() });
  codex.say({ jsonrpc: '2.0', id: codex.idOf('initialize'), result: {} });
  await settle();
  codex.say({ jsonrpc: '2.0', id: codex.idOf('thread/start'), result: { thread: { id: 'T-A' } } });
  await settle();
  const said = [];
  worker.stderr.on('data', (line) => said.push(line));
  codex.say({
    jsonrpc: '2.0',
    method: 'turn/completed',
    params: { threadId: 'T-A', turn: { id: 'X', status: 'failed', error } },
  });
  await tick();
  return said.join('\n');
};

describe('what a failed codex turn writes on the pipe the classifier reads', () => {
  // THE WHOLE POINT OF THE PREFIX: the code is in front, so the 300-character
  // window `noteExitForBackoff` takes off the tail line cannot cut it off, and
  // a limit whose prose the app has never seen is still a limit.
  it('puts the code first, so a long message cannot bury it', async () => {
    const line = await failedTurn({
      message: `${'x'.repeat(600)} and nothing recognisable in any of it`,
      codexErrorInfo: 'usageLimitExceeded',
    });
    expect(line.slice(0, 30)).toContain('usageLimitExceeded');
    expect(troubleCause(line.slice(0, 300))).toBe('at-limit');
  });

  // THE MEASURED SIGNED-OUT TURN, END TO END: the shape really observed on
  // 2026-09-05, through the worker, out of the pipe, into a cause.
  it('classifies the run measured against a signed-out codex', async () => {
    const line = await failedTurn({ message: SIGNED_OUT_401, codexErrorInfo: 'other' });
    expect(troubleCause(line)).toBe('signed-out');
  });

  // THE CASE THAT MUST NOT MATCH: a turn with no code at all is written
  // exactly as it always was, so nothing that reads these lines sees a new
  // shape where there is no new fact.
  it('adds nothing when there is no code', async () => {
    expect(await failedTurn({ message: 'the model refused' })).toBe('the model refused');
  });

  // Nor when the code is the schema's own "no idea" member, which says nothing
  // and would only be noise in front of the sentence that does.
  it('adds nothing when the code is other', async () => {
    expect(await failedTurn({ message: 'the model refused', codexErrorInfo: 'other' })).toBe('the model refused');
  });

  // A NESTED VARIANT IS AN OBJECT, NOT A STRING (`responseStreamDisconnected`
  // carries an httpStatusCode). It must not be stringified into the line as
  // "[object Object]".
  it('adds nothing when the code is one of the nested variants', async () => {
    const line = await failedTurn({
      message: 'the stream stopped',
      codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 500 } },
    });
    expect(line).toBe('the stream stopped');
    expect(line).not.toContain('object Object');
  });
});

/* ================ and claude code classifies exactly as before ============ */

describe('the strings that were already measured on claude code', () => {
  // Every one of these is pinned elsewhere too; they are here because this file
  // touched the two sets they live in, and a slice about the second engine that
  // moved the first engine's classification would be a bad trade at any price.
  for (const [text, cause] of [
    ["You've hit your session limit · resets 6pm (America/Los_Angeles)", 'at-limit'],
    ['You have reached your weekly limit', 'at-limit'],
    ['Failed to authenticate: OAuth session expired and could not be refreshed', 'signed-out'],
    // NOT SIGNED-OUT ANY MORE, AND THAT IS HER FIX RATHER THAN THIS SLICE'S.
    // (2026-09-06) added ORG_BLOCKED above SIGNED_OUT, because an account
    // whose workspace has Claude Code switched off is signed in and being told
    // to type /login. She did, twice in one afternoon; both logins worked and
    // nothing changed. The row moved when that landed, not when the second
    // engine did.
    ['organization has disabled Claude subscription access', 'org-blocked'],
    ['Not inside a trusted directory and --skip-git-repo-check was not specified.', 'workspace'],
    ['the response stopped arriving', 'interrupted'],
    ['this Mac went to sleep', 'interrupted'],
    ['', 'unknown'],
    ['something nobody has a word for', 'unknown'],
  ]) {
    it(`is still ${cause}: ${text.slice(0, 44) || '(nothing at all)'}`, () => {
      expect(troubleCause(text)).toBe(cause);
    });
  }
});
