// A RUN THAT DIED KNOWING WHY MUST SAY WHY.
//
// The app already had every word it needed. `shared/spawn-trouble.mjs` knows
// 'at-limit' from 'signed-out', and `deadRunSentence` writes her a plain
// sentence for either. What it did not have was a way for those words to reach
// a row, because two guards each assumed the other one covered the case
// between them:
//
//   - `sayTheRunDied` ran only when `session.result == null`.
//   - `speaksForTheSession` ran only when the result was NOT an error.
//
// So a run whose result WAS an error matched neither, and nothing was written.
// That is the commonest failure there is: a refused account does not die
// quietly, it reports a failed turn. Measured across her store 2026-08-27: 747
// runs on 146 rows ended with an error result. On Agentbox, 18 of the 74 rows
// they touched still carried no word about it. One row had been tried 236
// times and said nothing at all, and its whole trace log was four lines:
//
//   00:51:59  Failed to authenticate: OAuth session expired and could not be
//             refreshed
//   00:51:59  == RESULT (success ERROR · 1 turns) ==
//
// Note the second half of that: stderr was EMPTY. The diagnosis arrived as the
// result, so even reading the cause off the tail produced 'unknown' and the
// generic sentence, for a fault we can name exactly.
//
// These tests pin both halves: the error result is read as evidence, and it
// counts as the run having said nothing she can use.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor, saidNothingSheCanUse } from '../main/supervisor.mjs';
import { troubleCause } from '../shared/spawn-trouble.mjs';
import { Name } from '../shared/product-name.mjs';

// Verbatim from her own session logs, 2026-08-28T00:51:59Z.
const HER_SIGNED_OUT = 'Failed to authenticate: OAuth session expired and could not be refreshed';
// The shape Claude Code reports when the plan is spent. Kept as the fixture in
// renderer/src/fixtures.ts carries it, which is where it was captured.
const AT_LIMIT = 'API Error: Claude AI usage limit reached. Your weekly limit resets at 4pm.';

function makeSupervisor(item) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-w2565-'));
  const store = {
    listItems: () => [item],
    listProducts: () => [{ slug: 'agentbox', name: Name, dir: root }],
    isDue: () => true,
    written: [],
    recordSessionResult(product, id, patch) { this.written.push({ product, id, ...patch }); },
  };
  const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root);
  return { sup, store };
}

const hers = () => ({
  id: 'w-4966ad40a5', product: 'agentbox', status: 'open', kind: 'directive',
  labels: ['founder'], engine: 'claude',
  title: 'Reminder to the founder: Screenshot all your Twitter posts.',
});

// What her 236 dead runs actually looked like: nothing on stderr, the whole
// diagnosis in an error result.
const diedWithAnErrorResult = (words) => ({
  engine: 'claude',
  tail: ['session exited (1)'],
  result: words,
  resultIsError: true,
});

describe('the diagnosis arrives in the result, so the result is read', () => {
  it('names the account as at its limit when that is what the run reported', () => {
    const { sup, store } = makeSupervisor(hers());
    sup.sayTheRunDied(hers(), diedWithAnErrorResult(AT_LIMIT));
    expect(store.written).toHaveLength(1);
    expect(store.written[0].result).toMatch(/at its usage limit/);
    // The hour comes off the same line that reported the limit. This fixture
    // carries "resets at 4pm", so she is told 4pm instead of the older,
    // vaguer "when the limit resets".
    expect(store.written[0].result).toMatch(/starts again on its own at 4pm/);
  });

  it('names a signed-out account rather than falling back to the generic line', () => {
    // This is the exact input from her store. Before the fix it read only
    // stderr, found nothing, and said "stopped before it did anything".
    const { sup, store } = makeSupervisor(hers());
    sup.sayTheRunDied(hers(), diedWithAnErrorResult(HER_SIGNED_OUT));
    expect(store.written[0].result).toMatch(/could not sign in/);
    expect(store.written[0].result).not.toMatch(/stopped before it did anything/);
  });

  it('never puts the tool’s own words on her row', () => {
    // The whole doctrine of shared/spawn-trouble.mjs. She has already read
    // "OAuth session expired" across her inbox once and there is no OAuth in
    // Agentbox.
    const { sup, store } = makeSupervisor(hers());
    sup.sayTheRunDied(hers(), diedWithAnErrorResult(HER_SIGNED_OUT));
    expect(store.written[0].result).not.toMatch(/OAuth/i);
    expect(store.written[0].result).not.toMatch(/API Error/i);
  });

  it('leaves the row open, because the work still wants doing', () => {
    const { sup, store } = makeSupervisor(hers());
    sup.sayTheRunDied(hers(), diedWithAnErrorResult(AT_LIMIT));
    expect(store.written[0].status).toBe('open');
  });

  it('still prefers stderr when both carry words', () => {
    const { sup, store } = makeSupervisor(hers());
    sup.sayTheRunDied(hers(), {
      engine: 'claude',
      // A folder the CLI refuses to run in. It used to be the line Codex
      // printed; Codex is out of the app and this is the same fault said the
      // way Claude Code says it.
      tail: ['stderr: This directory is untrusted. Trust this folder to continue.'],
      result: AT_LIMIT,
      resultIsError: true,
    });
    expect(store.written[0].result).toMatch(/would not start in this project's folder/);
  });

  it('ignores a result that is not an error, because that run spoke for itself', () => {
    const { sup, store } = makeSupervisor(hers());
    sup.sayTheRunDied(hers(), {
      engine: 'claude',
      tail: [],
      result: 'I read the page and left it alone.',
      resultIsError: false,
    });
    expect(store.written[0].result).not.toMatch(/I read the page/);
  });

  it('says how many times, from the second try, so a pattern reads as a pattern', () => {
    const { sup, store } = makeSupervisor(hers());
    sup._fruitless['agentbox:w-4966ad40a5'] = { runs: 236 };
    sup.sayTheRunDied(hers(), diedWithAnErrorResult(AT_LIMIT));
    expect(store.written[0].result).toMatch(/happened 236 times/);
  });

  it('opens under 112 characters, which is where her inbox row clips', () => {
    const { sup, store } = makeSupervisor(hers());
    sup.sayTheRunDied(hers(), diedWithAnErrorResult(AT_LIMIT));
    const first = store.written[0].result.split(/(?<=\.)\s/)[0];
    expect(first.length).toBeLessThan(112);
  });
});

describe('an error result counts as the run having said nothing she can use', () => {
  // The gate in the exit handler. `speaksForTheSession` deliberately refuses an
  // error result so raw CLI text never reaches her row; that is right, and it
  // is exactly why the other writer has to take the case instead.
  it('speaksForTheSession still refuses to print an error result verbatim', () => {
    const { sup } = makeSupervisor(hers());
    expect(sup.speaksForTheSession(diedWithAnErrorResult(AT_LIMIT))).toBe(false);
  });

  it('and a clean result is still the session’s own to write', () => {
    const { sup } = makeSupervisor(hers());
    expect(sup.speaksForTheSession({ result: 'done', resultIsError: false })).toBe(true);
  });

  // The rule itself, which is what the two writers divide on. Every run has to
  // match exactly one of them; the bug was a run that matched neither.
  it('counts a run that said nothing', () => {
    expect(saidNothingSheCanUse({ result: null })).toBe(true);
  });

  it('counts a run whose only words were an error', () => {
    expect(saidNothingSheCanUse({ result: AT_LIMIT, resultIsError: true })).toBe(true);
  });

  it('leaves a run that really spoke alone', () => {
    expect(saidNothingSheCanUse({ result: 'I read the page.', resultIsError: false })).toBe(false);
  });

  it('leaves no run unwritten, whatever it did', () => {
    // Exhaustive over the three shapes a finished session can take: exactly one
    // writer must claim each, and this is the assertion the old code failed.
    const { sup } = makeSupervisor(hers());
    const shapes = [
      { result: null },
      { result: AT_LIMIT, resultIsError: true },
      { result: 'I read the page.', resultIsError: false },
    ];
    for (const s of shapes) {
      const claimed = [saidNothingSheCanUse(s), sup.speaksForTheSession(s)].filter(Boolean);
      expect(claimed).toHaveLength(1);
    }
  });
});

describe('the cause matcher reads her real words', () => {
  it('classifies the limit text as at-limit', () => {
    expect(troubleCause(AT_LIMIT)).toBe('at-limit');
  });

  it('classifies her signed-out text as signed-out', () => {
    expect(troubleCause(HER_SIGNED_OUT)).toBe('signed-out');
  });
});

describe('why nothing is running survives a restart', () => {
  // The reason lived in memory only, so a quit kept the symptom and dropped
  // the cause.
  const bootWith = (root) => new Supervisor(
    { storeRoot: root, maxConcurrentSessions: 3 },
    { listItems: () => [], listProducts: () => [] },
    root,
  );

  it('remembers which account is at its limit across a quit', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-w2565-boot-'));
    const first = bootWith(root);
    first._noteProfileTrouble('/second-account', AT_LIMIT);
    first._saveState();

    const second = bootWith(root);
    expect(second._profileTrouble['/second-account']?.cause).toBe('at-limit');
  });

  it('forgets it again as soon as a session survives on that account', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-w2565-clear-'));
    const first = bootWith(root);
    first._noteProfileTrouble('/second-account', AT_LIMIT);
    first._clearProfileTrouble('/second-account');
    first._saveState();

    const second = bootWith(root);
    expect(second._profileTrouble['/second-account']).toBeUndefined();
  });

  it('starts clean when there is no state file at all', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-w2565-fresh-'));
    expect(bootWith(root)._profileTrouble).toEqual({});
  });
});
