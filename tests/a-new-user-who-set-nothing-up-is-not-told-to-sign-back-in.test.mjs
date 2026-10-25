// A BRAND NEW USER WAS TOLD TO SIGN BACK IN TO AN ACCOUNT THEY NEVER HAD.
//
// QA batch 002, F-53 and F-54, on a Linux box with an empty Codex home and no
// Claude Code (`npm run fresh`), 2026-10-25:
//
//   - The plan screen's heading read "Found on this computer." when nothing
//     was signed in. Codex was on the disk and signed out, which is enough for
//     `afterCheck` to answer 'found', and the heading was the ready screen's
//     either way. The lede underneath already said the opposite ("Pick the
//     plan you pay for"), so the screen said both.
//   - They skipped setup, filed one task, and it came back inside half a
//     minute: "Codex could not sign in, so nothing has been done on this task.
//     Sign that account back in and it picks straight up." There was no
//     account, there had never been one, and nothing on the row said where to
//     set one up.
//
// The cause of the second is a real signed-out refusal (`unauthorized` off the
// app-server), and it is the right reading for somebody whose login has run
// out. What the sentence could not tell is a login that has run out from one
// that has never existed, and the login's own files answer that: no sign-in
// file at all means nobody ever signed in here.
//
// THE CASE THAT MUST NOT MATCH is a login that HAS signed in and been signed
// out since. It keeps every word it has always had.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  COPY, afterCheck, foundHead, foundLede, foundRows, readyEngines,
} from '../renderer/src/plan-setup.ts';
import { PlanQuestion } from '../renderer/src/components/PlanSetup.tsx';
import { deadRunCause, deadRunSentence, needsHerHands, refineCause, troubleCause } from '../shared/spawn-trouble.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';

const r = (engine, found, signedIn) => ({ engine, found, signedIn });

/** The QA box: Codex installed by the tester, never signed in, no Claude Code. */
const CODEX_SIGNED_OUT = [r('claude', false, false), r('codex', true, false)];
const CODEX_READY = [r('claude', false, false), r('codex', true, true)];
const NOTHING = [r('claude', false, false), r('codex', false, false)];

describe('the plan screen says what it found', () => {
  it('does not claim a find when nothing is signed in', () => {
    expect(afterCheck(CODEX_SIGNED_OUT)).toEqual({ t: 'found' });
    expect(readyEngines(CODEX_SIGNED_OUT)).toEqual([]);
    expect(foundHead(readyEngines(CODEX_SIGNED_OUT))).toBe(COPY.foundOutHead);
    expect(foundHead(readyEngines(CODEX_SIGNED_OUT))).not.toBe(COPY.foundHead);
  });

  // THE BOUNDARY ON THE OTHER SIDE: one signed-in plan, and the heading is the
  // one that shipped for it (w-e217e577e5).
  it('still says it found something the moment one plan is signed in', () => {
    expect(foundHead(readyEngines(CODEX_READY))).toBe(COPY.foundHead);
    expect(foundLede(readyEngines(CODEX_READY))).toBe('Your agents will run on your own ChatGPT plan.');
  });

  it('names no tool and no tier in the heading for a signed-out computer', () => {
    expect(COPY.foundOutHead).not.toMatch(/Claude Code|Codex|CLI|terminal|Max|Pro/i);
  });

  it('draws that heading on the screen, over the question screen’s own lede', () => {
    const html = renderToStaticMarkup(createElement(PlanQuestion, {
      found: CODEX_SIGNED_OUT, onPick: () => {}, onReady: () => {}, onSkip: () => {},
      look: async () => CODEX_SIGNED_OUT,
    }));
    expect(html).toContain(COPY.foundOutHead);
    expect(html).not.toContain(COPY.foundHead);
    expect(html).toContain(COPY.foundOut);
    // And the row that is on the disk still offers the sign-in, not an install.
    expect(foundRows(CODEX_SIGNED_OUT)[1].right).toBe(COPY.signIn);
  });

  // THE CASE THAT MUST NOT MATCH: an empty computer is the question, as it has
  // always been, and no heading there claims anything either.
  it('still asks a computer with nothing on it', () => {
    expect(afterCheck(NOTHING)).toEqual({ t: 'nothing' });
    const html = renderToStaticMarkup(createElement(PlanQuestion, {
      found: null, onPick: () => {}, onReady: () => {}, onSkip: () => {}, look: async () => NOTHING,
    }));
    expect(html).toContain(COPY.planHead);
    expect(html).not.toContain(COPY.foundHead);
    expect(html).not.toContain(COPY.foundOutHead);
  });

  // F-53 also read the skip link as "I will set up this up later". It does not
  // say that and never has; pinned here so the reading cannot become true.
  it('offers the way out in one reading', () => {
    expect(COPY.notNow).toBe('Not now, I will set this up later');
  });
});

describe('the sentence on a thread nothing could run', () => {
  it('says no plan is set up, and never to sign anything back in', () => {
    const said = deadRunSentence({ engineWord: 'Codex', cause: 'no-plan' });
    expect(said).toBe('No AI plan is set up on this computer, so nothing has been done on this task. Set one up at the top of your inbox and it picks straight up.');
    expect(said).not.toMatch(/back in|Codex|Claude/);
  });

  it('keeps every word of the signed-out sentence for a login that ran out', () => {
    expect(deadRunSentence({ engineWord: 'Codex', cause: 'signed-out' }))
      .toBe('Codex could not sign in, so nothing has been done on this task. Sign that account back in and it picks straight up.');
  });

  it('reads back off the row, so a stranded task is still counted', () => {
    expect(deadRunCause(deadRunSentence({ engineWord: 'Codex', cause: 'no-plan' }))).toBe('no-plan');
  });

  it('asks for the setup first when the app has stopped trying', () => {
    expect(deadRunSentence({ engineWord: 'Codex', cause: 'no-plan', gaveUp: true }))
      .toBe('No AI plan is set up on this computer, so nothing has been done on this task. Set up a plan at the top of your inbox. Then reply here to start it again.');
  });

  // Trying again in half an hour cannot set up a plan, so the account leaves
  // the rotation on the first sighting, the way a signed-out login does.
  it('is a cause only a person can end', () => {
    expect(needsHerHands('no-plan')).toBe(true);
  });
});

describe('which of the two a refusal is', () => {
  // The words are the same either way: this is the app-server's own 401, off a
  // CODEX_HOME with no auth.json (shared/spawn-trouble.mjs).
  const REFUSAL = 'unexpected status 401 Unauthorized: Missing bearer or basic authentication in header';

  it('is "no plan" when nobody has ever signed in on that login', () => {
    expect(troubleCause(REFUSAL)).toBe('signed-out');
    expect(refineCause('signed-out', null, { everSignedIn: false })).toBe('no-plan');
  });

  it('is still "signed out" for a login that has signed in before', () => {
    expect(refineCause('signed-out', null, { everSignedIn: true })).toBe('signed-out');
    expect(refineCause('signed-out', null)).toBe('signed-out');
  });

  it('leaves every other cause alone', () => {
    expect(refineCause('at-limit', null, { everSignedIn: false })).toBe('at-limit');
    expect(refineCause('org-blocked', { ended: true }, { everSignedIn: false })).toBe('subscription-ended');
  });
});

describe('the row a first task leaves behind', () => {
  let home;
  let items;
  let sup;

  const DIED = new Date(2026, 9, 25, 1, 13).getTime();
  const REFUSAL = 'unexpected status 401 Unauthorized: Missing bearer or basic authentication in header';

  const died = () => sup.sayTheRunDied(items[0], {
    tail: [`stderr: ${REFUSAL}`], engine: 'codex', profile: 'default', startedAt: DIED - 30_000,
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-no-plan-'));
    process.env.ASTRAL_HOME = home;
    items = [{
      id: 'w-hello', product: 'agentbox', status: 'open', kind: 'task', labels: ['founder'],
      title: 'Say hello in a file called hello.txt', wrote: { body: { ts: 1000, source: 'founder' } },
    }];
    const store = {
      listItems: () => items,
      listProducts: () => [{ slug: 'agentbox', name: Name, dir: home }],
      isDue: () => true,
      recordSessionResult(_product, id, patch) {
        const it = items.find((i) => i.id === id);
        if (it) { it.result = patch.result; it.wrote.result = { ts: DIED, source: 'agent' }; }
      },
    };
    sup = new Supervisor({ storeRoot: home, home, codexHome: path.join(home, '.codex'), maxConcurrentSessions: 3 }, store, home);
    sup._fruitless['agentbox:w-hello'] = { runs: 1, endedAt: DIED, founderAt: 0 };
  });

  afterEach(() => { delete process.env.ASTRAL_HOME; });

  it('tells a first-time user where to set a plan up', () => {
    died();
    expect(items[0].result).toBe('No AI plan is set up on this computer, so nothing has been done on this task. Set one up at the top of your inbox and it picks straight up.');
  });

  it('tells somebody whose login ran out to sign back in', () => {
    // The same refusal with a sign-in file beside it: this login existed.
    fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(home, '.codex', 'auth.json'), '{}');
    died();
    expect(items[0].result).toBe('Codex could not sign in, so nothing has been done on this task. Sign that account back in and it picks straight up.');
  });

  // THE DELIBERATE LIMIT. Claude Code writes `.claude.json` whether or not
  // anybody signs in, and on a Mac its credentials are in the Keychain, so no
  // file on disk can tell a login that never existed from one that ran out. A
  // Claude run keeps every word it has always had rather than guessing.
  it('says nothing new about a Claude run, which cannot be asked this', () => {
    sup.sayTheRunDied(items[0], {
      tail: ['stderr: Failed to authenticate: OAuth session expired and could not be refreshed'],
      engine: 'claude', startedAt: DIED - 30_000,
    });
    expect(items[0].result).toBe('Claude Code could not sign in, so nothing has been done on this task. Sign that account back in and it picks straight up.');
  });
});
