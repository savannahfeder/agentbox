// THE WORDS A LIMIT ACTUALLY USES.
//
// The session before this one fixed the plumbing: a run that dies reporting an
// error now gets a sentence written onto its row. It also told her, flatly,
// that there was no usage limit anywhere in her logs. That was wrong, and it
// was wrong for a reason worth pinning down forever: `troubleCause` was
// looking for the words "usage limit", and Claude Code does not use them.
//
// What it prints, verbatim from her store, 2026-08-28T00:56:35Z:
//
//   You've hit your session limit · resets 6pm (America/Los_Angeles)
//
// No "usage", no "rate", no "quota". So the classifier answered 'unknown', and
// 'unknown' draws a sentence that is not merely vague but false: it ends "it
// will keep failing the same way until this is fixed", when the limit lets go
// on its own at the hour printed on that very line.
//
// MEASURED over all 3,769 trace logs in ~/Zero/projects/*/sessions on
// 2026-08-28,: 751 runs ended
// with an error result, and 239 of them came back 'unknown'. 50 of those, on
// 27 rows, were limits. 189 were a run cut off by the machine or the network,
// 133 of them her own Mac going to sleep mid-response. After this change the
// unknown pile is 0 and the 512 already read as signed-out are untouched.

import { describe, it, expect } from 'vitest';
import {
  troubleCause, limitResetsAt, deadRunSentence, troubleSentence, troubleRemedy, accountSentence, needsHerHands,
} from '../shared/spawn-trouble.mjs';

// Every one of these is copied out of a real trace log in her store.
const HER_SESSION_LIMIT = "You've hit your session limit · resets 6pm (America/Los_Angeles)";
const HER_WEEKLY_LIMIT = "You've hit your weekly limit · resets 4pm (America/Los_Angeles)";
const HER_LATE_LIMIT = "You've hit your session limit · resets 10:10pm (America/Los_Angeles)";
const HER_SLEEP = 'API Error: Your computer went to sleep mid-response. The response above may be incomplete.';
const HER_CLOSED = 'API Error: Connection closed mid-response. The response above may be incomplete.';
const HER_DNS = "API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)";
const HER_OVERLOADED = 'API Error: 529 Overloaded. This is a server-side issue, usually temporary — try again in a moment.';
const HER_SIGNED_OUT = 'Failed to authenticate: OAuth session expired and could not be refreshed';

describe('the sentence her limit was always meant to get', () => {
  it('reads her own session limit line as a limit', () => {
    expect(troubleCause(HER_SESSION_LIMIT)).toBe('at-limit');
  });

  it('reads the weekly one too', () => {
    expect(troubleCause(HER_WEEKLY_LIMIT)).toBe('at-limit');
  });

  it('still reads the older API wording, so nothing that worked stopped working', () => {
    expect(troubleCause('API Error: Claude AI usage limit reached.')).toBe('at-limit');
    expect(troubleCause('rate limit exceeded')).toBe('at-limit');
  });

  it('tells her when it lets go, in the hour the tool printed', () => {
    expect(limitResetsAt(HER_SESSION_LIMIT)).toBe('6pm');
    expect(limitResetsAt(HER_LATE_LIMIT)).toBe('10:10pm');
    expect(limitResetsAt('Your weekly limit resets at 4pm.')).toBe('4pm');
  });

  it('says nothing about an hour when the line does not carry one', () => {
    expect(limitResetsAt('API Error: Claude AI usage limit reached.')).toBe(null);
    expect(limitResetsAt(null)).toBe(null);
  });

  it('puts the hour in the sentence she reads', () => {
    const said = deadRunSentence({ engineWord: 'Claude Code', cause: 'at-limit', runs: 8, resetsAt: '6pm' });
    expect(said).toMatch(/at its usage limit/);
    expect(said).toMatch(/starts again on its own at 6pm/);
  });

  it('keeps the old wording when there is no hour to give', () => {
    const said = deadRunSentence({ engineWord: 'Claude Code', cause: 'at-limit', runs: 2 });
    expect(said).toMatch(/starts again on its own when the limit resets/);
  });

  it('never tells her a limit will keep failing until she fixes it', () => {
    // This is the whole defect. Before, her limit read as 'unknown' and got the
    // generic line, which asks her to go and fix something that fixes itself.
    const said = deadRunSentence({ engineWord: 'Claude Code', cause: troubleCause(HER_SESSION_LIMIT), runs: 8, resetsAt: limitResetsAt(HER_SESSION_LIMIT) });
    expect(said).not.toMatch(/until this is fixed/);
  });

  it('does not send her to sign an account back in for a limit', () => {
    // 'signed-out' is the one cause that needs her hands, and a limit is not it.
    expect(needsHerHands(troubleCause(HER_SESSION_LIMIT))).toBe(false);
    expect(needsHerHands(troubleCause(HER_SIGNED_OUT))).toBe(true);
  });
});

describe('a run the machine or the network cut off', () => {
  it('names her Mac going to sleep, which is the commonest dead run there is', () => {
    expect(troubleCause(HER_SLEEP)).toBe('interrupted');
  });

  it('names a dropped connection, a dead name lookup and an overloaded server', () => {
    expect(troubleCause(HER_CLOSED)).toBe('interrupted');
    expect(troubleCause(HER_DNS)).toBe('interrupted');
    expect(troubleCause(HER_OVERLOADED)).toBe('interrupted');
  });

  it('tells her there is nothing to fix, because there is not', () => {
    const said = deadRunSentence({ engineWord: 'Claude Code', cause: 'interrupted', runs: 3 });
    expect(said).toMatch(/was cut off in the middle/);
    expect(said).toMatch(/runs it again on its own/);
    expect(said).not.toMatch(/until this is fixed/);
  });

  it('has a sentence everywhere the other three causes do', () => {
    for (const said of [troubleSentence('interrupted'), troubleRemedy('interrupted'), accountSentence('interrupted')]) {
      expect(said).toBeTruthy();
      expect(said).not.toMatch(/undefined/);
    }
    // The screen may never carry the tool's own words.
    expect(accountSentence('interrupted')).not.toMatch(/API Error|ENOTFOUND|mid-response/);
  });

  it('is the weakest claim of the four, so an account fault still wins', () => {
    // A signed-out or capped account often mentions a connection on the way
    // down, and the account is the fact worth saying.
    expect(troubleCause(`${HER_SIGNED_OUT}\n${HER_CLOSED}`)).toBe('signed-out');
    expect(troubleCause(`${HER_SESSION_LIMIT}\n${HER_CLOSED}`)).toBe('at-limit');
  });
});

describe('nothing that already had a name lost it', () => {
  it('leaves signed-out, workspace and empty text exactly as they were', () => {
    expect(troubleCause(HER_SIGNED_OUT)).toBe('signed-out');
    // The folder fault in the words the one engine left prints. The line that
    // used to stand here was Codex's, and Codex is out of the app whole, so
    // the classifier no longer carries its wording.
    expect(troubleCause('This directory is untrusted. Trust this folder to continue.')).toBe('workspace');
    expect(troubleCause('')).toBe('unknown');
    expect(troubleCause(null)).toBe('unknown');
  });

  it('still has an honest generic for words we genuinely cannot place', () => {
    expect(troubleCause('Segmentation fault')).toBe('unknown');
    expect(deadRunSentence({ cause: 'unknown', runs: 1 })).toMatch(/stopped before it did anything/);
  });

  it('keeps every first sentence inside the row budget of 112 characters', () => {
    // SUMMARY_BUDGET in renderer/src/list-rules.ts. A first sentence past it is
    // clipped, and the first sentence is the whole point of the message.
    for (const cause of ['signed-out', 'at-limit', 'workspace', 'interrupted', 'unknown']) {
      const first = deadRunSentence({ engineWord: 'Claude Code', cause, runs: 9, resetsAt: '10:10pm' }).split('. ')[0];
      expect(first.length).toBeLessThan(112);
    }
  });
});
