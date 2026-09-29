// THE CORNER NEVER STARTS A CODING AGENT TO DRAW ITSELF.
//
// A meter that spawns a process to fill itself in is the reading paying for
// itself, and this app already has the cautionary tale written down.
// main/claude-usage.mjs opens on it: `claude -p '/usage'` was TIMED TWICE at
// 23.2s and 28.0s, and running it in the wrong folder raised macOS permission
// prompts for a network volume and the Music library ten seconds into a
// session whose only job was to print a percentage.
//
// UNTIL 2026-09-05 A CODEX-ONLY WORKFLOW WAS STILL PAYING THAT, every five
// minutes, for a figure nothing was going to draw. `zero:snapshot` called
// `usage.read` unconditionally, and `read` starts a child whenever its figure
// has gone stale. So the corner's own answer -- which coding agent it is about
// -- is now the gate on the asking, and the branch is what makes it unaskable
// rather than a flag somebody has to remember.
//
// AND THE CODEX SIDE STARTS NOTHING AT ALL, EVER. `Supervisor#_codexServer`
// SPAWNS an app-server when it finds none, which is right for a worker about to
// run and would be the same defect for a corner about to draw a bar. On a Mac
// that has never run a Codex worker there is no reading at all, the corner draws
// nothing, and nothing was spent finding that out -- which is the honest answer
// and the one the dashboard law asks for: a limit nobody has read is not a limit
// at nothing (tests/a-codex-limit-nobody-has-read-is-not-zero.test.mjs).
//
// ============ AND IT ASKS FOR NOTHING EITHER ==========
//
// This corner briefly ALSO sent `account/rateLimits/read` down the pipe when its
// figure went stale. It is gone, deliberately, and this is the paragraph that
// stops the next reader putting it back as an obvious improvement.
//
// IT IS NOT A LOCAL LOOKUP. Measured on this Mac 2026-09-05 against a real
// `codex app-server` 0.148.0 in a scratch CODEX_HOME with no credentials:
// `account/rateLimits/read` answered
// `{"error":{"code":-32600,"message":"codex account authentication required to
// read rate limits"}}`. A call answered out of state the app-server already
// holds does not need an account token; one that has to SEND that token does.
// The binary agrees -- `app-server/src/request_processors/account_processor.rs`
// reaches `backend-client/src/client/rate_limit_resets.rs`, and the strings
// beside it are `/api/codex/usage`, `https://chatgpt.com/backend-api`,
// `failed to fetch codex rate limits: no snapshots returned` and
// `rate limit reset credit detail request timed out`. Local state does not time
// out and has no snapshots to fail to return.
//
// SO IT IS A NEW NETWORK CALL, and CLAUDE.md's privacy rule is not negotiable:
// "Anything that leaves the machine... a new network call of any kind" means
// `legal/privacy.html` and `legal/terms.html` are edited IN THE SAME SESSION.
// Those pages live outside this repo, so that obligation
// cannot be discharged from here -- and shipping the call without it breaks a
// stated law rather than bending one.
//
// THE COST OF NOT HAVING IT WAS MEASURED AND IS SMALL. The figures arrive free
// as `account/rateLimits/updated` during every turn, so the corner fills a beat
// later -- once a Codex turn starts pushing -- instead of being asked for. And a
// workspace set to Codex with nothing running drew no corner either way, because
// there was no app-server there to ask.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexUsage } from '../main/codex-usage.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(root, p), 'utf8');
/**
 * The file with its comments taken out, so a law is measured in the code and
 *  never in the prose that explains it -- the lesson at the foot of this file. */
const code = (p) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const LIMITS = {
  primary: { usedPercent: 33, windowDurationMins: 300, resetsAt: 1788573509 },
  secondary: { usedPercent: 63, windowDurationMins: 10080, resetsAt: 1788798916 },
};

describe('a Mac with no Codex app-server running', () => {
  it('has no reading, and asks nobody for one', () => {
    const usage = new CodexUsage({ home: () => '/h' });
    expect(usage.read()).toBe(null);
    expect(usage.read()).toBe(null);
  });

  // THE BOUNDARY IN TIME, which is where the old refresh lived: it fired the
  // moment a reading aged past five minutes. Nothing here may age into an ask.
  it('still has no reading an hour later, because waiting is not an ask', () => {
    let clock = 1_000_000;
    const usage = new CodexUsage({ home: () => '/h', now: () => clock });
    expect(usage.read()).toBe(null);
    clock += 60 * 60_000;
    expect(usage.read()).toBe(null);
  });
});

describe('the corner asks the app-server for nothing', () => {
  // THE LAW ITSELF, AND IT IS UNASKABLE RATHER THAN MERELY UNASKED. There is no
  // client on this reader and no call to make one with, so re-adding the read
  // means re-adding the wiring -- which is what brings somebody back to the
  // paragraph at the top of this file.
  it('has no way to reach the app-server at all', () => {
    const reader = code('main/codex-usage.mjs');
    expect(reader).not.toContain('account/rateLimits/read');
    expect(reader).not.toContain('.request(');
    expect(reader).not.toContain('client');
  });

  // AND NOWHERE ELSE IN THE APP EITHER. The method name is the thing to search
  // for: one occurrence anywhere in shipped code is the call being back.
  it('is not asked for anywhere in the app', () => {
    for (const file of ['main/codex-usage.mjs', 'shared/codex-usage.mjs', 'main/supervisor.mjs', 'main/ipc.mjs', 'main/codex-app-server.mjs']) {
      expect(code(file)).not.toContain('account/rateLimits/read');
    }
  });

  // AND THE SUPERVISOR HANDS IT NO CLIENT. `liveCodexClient` existed only to
  // feed that read; leaving it behind would be the dead half of a removed
  // feature, and the next reader would wire it back up because it is there.
  it('is not handed an app-server by the supervisor', () => {
    const sup = code('main/supervisor.mjs');
    expect(sup).not.toContain('liveCodexClient');
    expect(sup).toContain('this._codexLimits = new CodexUsage({');
    expect(sup).not.toMatch(/new CodexUsage\(\{[^}]*client:/s);
  });

  // AND THE SAME LAW AS BEHAVIOUR RATHER THAN AS SOURCE, because a test that
  // only greps is a test that a rename defeats. An app-server is handed in the
  // way the removed wiring handed one, and it is never spoken to -- at first
  // read, and past the five minutes the old refresh used to fire at.
  it('does not speak to an app-server even when one is put in its hand', async () => {
    const asked = [];
    let clock = 1_000_000;
    const usage = new CodexUsage({
      client: () => ({ request: (m, p) => { asked.push([m, p]); return Promise.resolve({ rateLimits: LIMITS }); } }),
      home: () => '/h',
      now: () => clock,
    });
    usage.read();
    clock += 60 * 60_000;
    usage.read();
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    expect(asked).toEqual([]);
    expect(usage.read()).toBe(null);
  });

  // THE CASE THAT MUST NOT MATCH, so this is a rule about the CORNER and not a
  // ban on the app-server having a `request` at all: `config/read` still goes
  // down that pipe, for the thread that is about to run.
  it('does not stop a worker asking the app-server what it needs to run', () => {
    expect(code('main/supervisor.mjs')).toContain("client.request('config/read', {})");
  });
});

describe('the reading it does have comes from the push alone', () => {
  // What the corner is now made of, end to end: nothing, then a notification
  // that already arrives during every turn, then a drawn pair of windows.
  it('is nothing until a turn pushes, and the windows after it', () => {
    const usage = new CodexUsage({ home: () => '/h' });
    expect(usage.read()).toBe(null);
    expect(usage.saw('account/rateLimits/updated', { rateLimits: LIMITS })).toBe(true);
    expect(usage.read().limits.map((l) => l.percent)).toEqual([33, 63]);
  });

  // AND "NO READING YET" NEVER BECOMES A ZERO, which is the dashboard law and
  // the thing losing the read could quietly have broken. This repo really does
  // put `{ rateLimits: {} }` on that channel
  // (tests/one-codex-process-carries-many-threads-and-a-card-nobody-answers-denies.test.mjs).
  it('is still nothing after a push that carried no window, never a pair of zeroes', () => {
    const usage = new CodexUsage({ home: () => '/h' });
    usage.saw('account/rateLimits/updated', { rateLimits: {} });
    expect(usage.read()).toBe(null);
    usage.saw('account/rateLimits/updated', {});
    expect(usage.read()).toBe(null);
  });

  // A READING OUTLIVES THE PROCESS THAT GAVE IT. The app-server going down is
  // how every Codex run ends, and a corner that empties itself each time the
  // fleet drains is worse than one that is five minutes behind -- the same
  // judgement main/claude-usage.mjs makes when its command fails.
  it('is kept once the app-server that pushed it has gone', () => {
    let clock = 1_000_000;
    const usage = new CodexUsage({ home: () => '/h', now: () => clock });
    usage.saw('account/rateLimits/updated', { rateLimits: LIMITS });
    clock += 6 * 60 * 60_000;
    expect(usage.read().limits.map((l) => l.percent)).toEqual([33, 63]);
    // And it still says how old it is, which is what makes keeping it honest.
    expect(usage.read().at).toBe(1_000_000);
  });
});

describe('a reading belongs to the login that gave it', () => {
  // CODEX_HOME is the variable that names which account pays
  // (`_codexServer` in main/supervisor.mjs). Showing one login's percentage over
  // another login's work is this whole slice's defect, one level down.
  it('is dropped rather than redrawn when the login moves', () => {
    let home = '/one';
    const usage = new CodexUsage({ home: () => home });
    usage.saw('account/rateLimits/updated', { rateLimits: LIMITS });
    expect(usage.read().limits).toHaveLength(2);

    home = '/two';
    expect(usage.read()).toBe(null);
  });

  // And a notification from the OTHER login's app-server is not this one's news.
  it('ignores an update raised under a login that is not the current one', () => {
    const usage = new CodexUsage({ home: () => '/one' });
    expect(usage.saw('account/rateLimits/updated', { rateLimits: LIMITS }, '/two')).toBe(false);
    expect(usage.read()).toBe(null);
    // The case that must match, so the refusal is about the home and not about
    // the channel being deaf.
    expect(usage.saw('account/rateLimits/updated', { rateLimits: LIMITS }, '/one')).toBe(true);
    expect(usage.read().limits).toHaveLength(2);
  });

  // Everything that belongs to no thread comes down this one channel -- eighteen
  // methods in the 0.148.0 schema -- so the reader is handed all of them and
  // keeps the one it is about.
  it('keeps only the notification it is about', () => {
    const usage = new CodexUsage({ home: () => '/h' });
    expect(usage.saw('remoteControl/status/changed', { status: 'disabled' })).toBe(false);
    expect(usage.saw('turn/completed', {})).toBe(false);
    expect(usage.read()).toBe(null);
  });

  // A PUSH REDRAWS THE WINDOW, and only when the figures really moved. The same
  // rule main/claude-usage.mjs follows: never called for a refresh that changed
  // nothing.
  it('tells the window when the figures move, and not when they do not', () => {
    const said = [];
    const usage = new CodexUsage({ home: () => '/h', onChange: () => said.push(1) });
    usage.saw('account/rateLimits/updated', { rateLimits: LIMITS });
    expect(said).toHaveLength(1);
    usage.saw('account/rateLimits/updated', { rateLimits: LIMITS });
    expect(said).toHaveLength(1);
    usage.saw('account/rateLimits/updated', { rateLimits: { primary: { usedPercent: 34 } } });
    expect(said).toHaveLength(2);
  });
});

describe('the Claude spawn is behind the corner\'s own answer', () => {
  // main/ipc.mjs cannot be loaded here -- it imports electron at module scope --
  // so this is asserted as source, which is what the rest of this repo does for
  // wiring with no pure function under it.
  it('asks for the Claude reading only on a snapshot whose corner is Claude Code', () => {
    const ipc = read('main/ipc.mjs');
    expect(ipc).toContain('usageFor === DEFAULT_ENGINE ? usage.read() : supervisor.codexUsage()');
    // AND NOWHERE ELSE. One asking of it in the whole file, inside that branch,
    // is what makes the spawn unaskable rather than merely usually-unasked.
    //
    // COUNTED IN THE CODE AND NOT IN THE PROSE. The first draft of this counted
    // every occurrence in the file and went red on the comment three lines above
    // the call, which explains why the branch is there. An anchor a paragraph
    // can move is not an anchor -- the same lesson
    // tests/one-coding-agent-draws-nothing-new.test.mjs learned about measuring
    // a distance from a comment.
    const code = ipc.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(code.match(/usage\.read\(\)/g)).toHaveLength(1);
  });
});
