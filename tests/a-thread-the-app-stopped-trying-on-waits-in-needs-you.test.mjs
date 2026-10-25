// A THREAD THE APP HAS STOPPED TRYING ON WAITS IN NEEDS YOU, NOT IN PROGRESS.
//
// Two threads sat in In progress for hours under "Codex stopped before it did
// anything, so this task has not been started. Agentbox keeps trying, and it
// will keep failing the same way until this is fixed." (2026-10-20). Nothing
// was trying. Each carried a reply, the runs sent to carry it died on arrival
// (a Codex model the plan on that computer does not include), and on the third
// `settleDeliveryAndSay` gives up: the reply stays marked as handled, so
// nothing starts the thread again until somebody writes on it. In progress
// read an open thread with an unsettled reply as "a worker is about to start"
// (`belongsInProgress`), and the sentence promised a retry that never came.
//
// Measured on the store: w-b616e878fe open, its reply written at
// 1792455359012, the app's sentence at 1792455511879, `answeredThrough` older
// than the reply, and no other write for five hours.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';
import { deadRunSentence, undeliveredAnswerSentence, saysARunGotNowhere } from '../shared/spawn-trouble.mjs';
import { belongsInInbox, belongsInProgress, gaveUpOnTheAnswer } from '../renderer/src/list-rules';

const ANSWER_AT = 1_792_455_359_012;
const SAID_AT = 1_792_455_511_879;
const NOW = SAID_AT + 5 * 3_600_000;

const stuck = {
  id: 'w-b616e878fe', product: 'agentbox-team', status: 'open', kind: 'directive',
  labels: ['founder'], engine: 'codex', model: 'gpt-6.1-sol',
  title: 'The image strip at the bottom of the viewer',
  answer: 'Option 1: Ship the bottom strip (recommended)',
  answeredThrough: 1_792_277_453_132,
  result: `Codex stopped before it did anything, so this task has not been started. ${Name} keeps trying, and it will keep failing the same way until this is fixed.`,
  createdAt: ANSWER_AT - 86_400_000, updatedAt: SAID_AT + 108,
  wrote: {
    answer: { ts: ANSWER_AT, source: 'founder' },
    result: { ts: SAID_AT, source: 'agent' },
    status: { ts: SAID_AT + 108, source: 'system' },
  },
};

const inbox = (i, o = {}) => belongsInInbox(i, { now: NOW, ...o });
const progress = (i, o = {}) => belongsInProgress(i, { now: NOW, ...o });

describe('the thread from the screenshot', () => {
  it('is in Needs you', () => expect(inbox(stuck)).toBe(true));
  it('is not in In progress', () => expect(progress(stuck)).toBe(false));
});

describe('only when the app spoke after the reply, and nothing is on it', () => {
  it('a reply sent after the sentence is waiting its turn, so In progress', () => {
    const replied = { ...stuck, wrote: { ...stuck.wrote, answer: { ts: SAID_AT + 1_000, source: 'founder' } } };
    expect(progress(replied)).toBe(true);
    expect(inbox(replied)).toBe(false);
  });

  it("an agent's own words after the reply are not the app giving up", () => {
    const working = { ...stuck, result: 'Built the strip; checking it on a small window next.' };
    expect(gaveUpOnTheAnswer(working)).toBe(false);
    expect(progress(working)).toBe(true);
    expect(inbox(working)).toBe(false);
  });

  it('a session on it keeps it in In progress', () => {
    expect(progress(stuck, { live: true })).toBe(true);
    expect(inbox(stuck, { live: true })).toBe(false);
  });

  it('a thread a worker has claimed is not given up on', () => {
    const claimed = { ...stuck, status: 'claimed' };
    expect(gaveUpOnTheAnswer(claimed)).toBe(false);
    expect(progress(claimed)).toBe(true);
  });

  it('a thread put away until later stays away', () => {
    expect(inbox(stuck, { hiddenUntil: NOW + 60_000 })).toBe(false);
  });

  it('a withdrawn reply is no reply', () => {
    expect(gaveUpOnTheAnswer({ ...stuck, answer: '(withdrawn)' })).toBe(false);
  });
});

/* ------------- every sentence the give-up path can write --------------- */

const ITEM = {
  id: 'w-1a2b3c4d5e', product: 'agentbox', status: 'open', kind: 'directive', labels: ['founder'],
  title: 'Tighten the image strip', answer: 'Yes, ship it.',
  wrote: { answer: { ts: ANSWER_AT, source: 'founder' } },
};

const deaths = {
  'a model the plan does not include': () => ({ engine: 'codex', tail: ["stderr: The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account."], result: null }),
  'a reason nobody can name': () => ({ engine: 'codex', tail: ['stderr: something went wrong'], result: null }),
  'a folder it will not run in': () => ({ engine: 'codex', tail: ['stderr: Not inside a trusted directory and --skip-git-repo-check was not specified.'], result: null }),
  'a thinking level the model does not offer': () => ({ engine: 'codex', tail: ['stderr: xhigh is not a level that model offers'], result: null }),
  'a limit': () => ({ engine: 'claude', tail: [], result: "You've hit your session limit · resets 6pm (America/Los_Angeles)", resultIsError: true }),
  'a dropped connection': () => ({ engine: 'claude', tail: ['stderr: ECONNRESET'], result: null }),
  'a run that used a tool and then died': () => ({ engine: 'claude', tail: ['stderr: boom'], result: null, usedATool: true }),
  'a run that finished and never reached the thread': () => ({ engine: 'codex', tail: [], result: 'I had a look at this.', resultIsError: false }),
};

const PROMISE = /on its own|keeps trying|picks straight up|it will run|tries again|tries it again|runs it again/i;

describe('every sentence the give-up path writes', () => {
  let sup;
  let written;
  beforeEach(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gave-up-'));
    written = [];
    sup = new Supervisor(
      { storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
      {
        listItems: () => [ITEM],
        listProducts: () => [{ slug: 'agentbox', name: Name, dir: root }],
        readItem: () => ITEM,
        settleAnswer() {},
        recordSessionResult(product, id, patch) { written.push({ product, id, ...patch }); },
      },
      root,
    );
  });

  const giveUp = (death) => {
    for (let n = 0; n < 3; n += 1) {
      sup._handledAnswers.add(sup._answerKey(ITEM, ITEM.answer));
      sup.settleDeliveryAndSay(ITEM, ITEM.answer, death(), null);
    }
    expect(written).toHaveLength(1);
    return written[0].result;
  };
  const onTheThread = (result) => ({
    ...ITEM, result, wrote: { ...ITEM.wrote, result: { ts: ANSWER_AT + 60_000, source: 'agent' } },
  });

  for (const [name, death] of Object.entries(deaths)) {
    it(`puts the thread in Needs you after ${name}`, () => {
      const row = onTheThread(giveUp(death));
      expect(inbox(row)).toBe(true);
      expect(progress(row)).toBe(false);
    });

    it(`does not promise a retry after ${name}`, () => {
      const said = giveUp(death);
      expect(said).not.toMatch(PROMISE);
      expect(said).toMatch(/reply/i);
    });
  }

  it('still names the hour a limit resets', () => {
    expect(giveUp(deaths['a limit'])).toMatch(/6pm/);
  });

  it('still says what to fix when there is a fix', () => {
    expect(giveUp(deaths['a model the plan does not include'])).toMatch(/pick another model/i);
  });
});

/* ---------------- the sentences, cause by cause ----------------------- */

const CAUSES = ['workspace', 'signed-out', 'org-blocked', 'subscription-ended', 'at-limit', 'interrupted',
  'model-not-on-plan', 'level-not-offered', 'network', 'too-old', 'api-key', 'codex-config', 'unknown'];

describe('the sentence written once the app has stopped trying', () => {
  for (const cause of CAUSES) {
    for (const worked of [false, true]) {
      for (const elsewhere of [false, true]) {
        it(`${cause}${worked ? ', after a tool' : ''}${elsewhere ? ', another login free' : ''}: asks for a reply and promises nothing`, () => {
          const said = deadRunSentence({ engineWord: 'Codex', cause, worked, elsewhere, gaveUp: true });
          expect(said).not.toMatch(PROMISE);
          expect(said).toMatch(/(Then r|\. R)eply here to start it again\.$/);
          expect(saysARunGotNowhere(said)).toBe(true);
        });
      }
    }
  }

  it('leaves the sentence for a run the app will retry as it was', () => {
    expect(deadRunSentence({ engineWord: 'Codex', cause: 'unknown' })).toMatch(new RegExp(`${Name} tries again on its own\\.$`));
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'at-limit', resetsAt: '6pm' })).toMatch(/starts again on its own at 6pm/);
  });
});

/* ------------- through the real store and the real supervisor ---------- */

describe('a reply whose three runs die, through the real store', () => {
  let root;
  let store;
  let sup;
  let id;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T09:00:00Z'));
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'gave-up-store-'));
    const dir = path.join(root, 'project');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'project', name: 'Project' }));
    const config = { accountRoot: root, storeRoot: root, products: [], personalProducts: [] };
    store = await new Store(config).init();
    sup = new Supervisor(config, store, path.resolve('.'), root);
    sup._saveState = () => {};
    id = store.composeItem('project', { title: 'Tighten the image strip', body: 'Tighten the image strip.' }).id;
    vi.setSystemTime(Date.now() + 60_000);
    store.answerItem('project', id, { answer: 'Option 1: Ship the bottom strip', status: 'open' });
  });
  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const read = () => store.readItem('project', id);
  const dies = () => {
    vi.setSystemTime(Date.now() + 2_000);
    const item = read();
    sup._handledAnswers.add(sup._answerKey(item, item.answer));
    return sup.settleDeliveryAndSay(item, item.answer, deaths['a model the plan does not include'](), null);
  };

  it('stays in In progress while another run is coming', () => {
    expect(dies()).toBe('retrying');
    expect(belongsInProgress(read())).toBe(true);
    expect(belongsInInbox(read())).toBe(false);
  });

  it('moves to Needs you once the app gives up', () => {
    dies(); dies();
    expect(dies()).toBe('given up');
    expect(belongsInInbox(read())).toBe(true);
    expect(belongsInProgress(read())).toBe(false);
  });

  it('goes back to In progress when you reply', () => {
    dies(); dies(); dies();
    vi.setSystemTime(Date.now() + 60_000);
    store.answerItem('project', id, { answer: 'Try it on the other model', status: 'open' });
    expect(belongsInProgress(read())).toBe(true);
    expect(belongsInInbox(read())).toBe(false);
  });
});

describe('what counts as the app saying a run got nowhere', () => {
  it('the dead-run sentence, in today and yesterday\'s words', () => {
    expect(saysARunGotNowhere(stuck.result)).toBe(true);
    expect(saysARunGotNowhere(deadRunSentence({ engineWord: 'Codex', cause: 'model-not-on-plan' }))).toBe(true);
  });

  it('the reply that never landed', () => {
    expect(saysARunGotNowhere(undeliveredAnswerSentence({ engineWord: 'Codex', attempts: 3 }))).toBe(true);
  });

  it('not an agent writing about its own work, even about stopping', () => {
    expect(saysARunGotNowhere('Stopped partway: the build failed, so I reverted the change.')).toBe(false);
    expect(saysARunGotNowhere('')).toBe(false);
    expect(saysARunGotNowhere(undefined)).toBe(false);
  });
});
