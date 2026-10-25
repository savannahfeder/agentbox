// A TASK THE APP SAYS IT TRIES AGAIN IS TRIED AGAIN (w-4465054f04, 2026-10-22).
//
// In the cloud storm two Codex threads did their work in the cloud and
// committed it, were cut off by a quit, and resumed on this Mac, where the
// app-server never answered. Both rows then read "Codex stopped before it did
// anything, so this task has not been started ... Agentbox tries again on its
// own." Neither was tried again: 20 minutes after the 15-minute rest ended the
// rows had two runs each and no third. The sentence is written as an agent's
// result, `awaitingHer` takes any agent result as an answer waiting on her, and
// only account trouble was let past that. And "has not been started" was false:
// the branch held the committed work.
//
// Now our own sentence keeps a row in the queue whenever the sentence promises
// a retry, the rest ladder still decides when, and a run that was picking a
// thread back up says the task is not finished rather than not started.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { deadRunSentence, deadRunPromisesARetry } from '../shared/spawn-trouble.mjs';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const bare = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tries-again-'));
  dirs.push(root);
  const sup = new Supervisor({ storeRoot: root, home: root, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [], isDue: () => true }, root);
  sup._saveState = () => {};
  return sup;
};

const MIN = 60_000;
const SAID = 1_000_000;
// A row she wrote, whose last word is our own sentence about a run that died.
const row = (resultTs = SAID) => ({
  id: 'w-1', product: 'p', title: 'Add ini.js', status: 'open', kind: 'directive', labels: ['founder'],
  result: 'Codex stopped before it did anything, so this task has not been started.',
  wrote: { title: { ts: 1, source: 'founder' }, body: { ts: 1, source: 'founder' }, labels: { ts: 1, source: 'founder' }, result: { ts: resultTs, source: 'agent' } },
});
const said = (sup, why, extra = {}) => {
  sup._fruitless = { 'p:w-1': { runs: 1, endedAt: SAID, founderAt: 1, saidAt: SAID, saidTs: SAID, ...(why ? { saidWhy: why } : {}), ...extra } };
};

describe('a row whose last word is our own sentence', () => {
  it('is tried again once its rest is over, when the sentence said so', () => {
    const sup = bare();
    said(sup, 'unknown');
    expect(sup._isFreshWork(row(), SAID + 16 * MIN)).toBe(true);
  });

  it('still rests first', () => {
    const sup = bare();
    said(sup, 'unknown');
    expect(sup._isFreshWork(row(), SAID + 14 * MIN)).toBe(false);
  });

  it('is tried again after a run that worked and then stopped', () => {
    const sup = bare();
    said(sup, undefined);
    expect(sup._isFreshWork(row(), SAID + 16 * MIN)).toBe(true);
  });

  it('waits for her when the sentence asks her to change the task', () => {
    const sup = bare();
    said(sup, 'level-not-offered');
    expect(sup._isFreshWork(row(), SAID + 16 * MIN)).toBe(false);
    said(sup, 'model-not-on-plan');
    expect(sup._isFreshWork(row(), SAID + 16 * MIN)).toBe(false);
  });

  it('waits for her once the app has stopped carrying a reply', () => {
    const sup = bare();
    said(sup, 'unknown', { saidGaveUp: true });
    expect(sup._isFreshWork(row(), SAID + 16 * MIN)).toBe(false);
  });

  it('waits for her when an agent answered after our sentence', () => {
    const sup = bare();
    said(sup, 'unknown');
    expect(sup._isFreshWork(row(SAID + 5 * MIN), SAID + 16 * MIN)).toBe(false);
  });
});

describe('the sentence and the queue say the same thing', () => {
  const CAUSES = ['workspace', 'signed-out', 'org-blocked', 'subscription-ended', 'at-limit', 'interrupted', 'model-not-on-plan',
    'level-not-offered', 'network', 'too-old', 'api-key', 'codex-config', 'open-elsewhere', 'unknown'];
  const PROMISE = /again on its own|picks straight up|runs it again|keeps trying|keep failing/;
  for (const cause of CAUSES) {
    it(cause, () => {
      const sentence = deadRunSentence({ engineWord: 'Codex', cause });
      expect(deadRunPromisesARetry({ cause })).toBe(PROMISE.test(sentence));
    });
  }
  it('a reply the app stopped carrying promises nothing', () => {
    expect(deadRunSentence({ engineWord: 'Codex', cause: 'unknown', gaveUp: true })).not.toMatch(PROMISE);
    expect(deadRunPromisesARetry({ cause: 'unknown', gaveUp: true })).toBe(false);
  });
});

describe('a run that was picking a thread back up', () => {
  it('says the task is not finished, never that it has not been started', () => {
    const sentence = deadRunSentence({ engineWord: 'Codex', cause: 'unknown', partway: true });
    expect(sentence).not.toMatch(/not been started|nothing has been done|before it did anything/);
    expect(sentence).toMatch(/^Codex .*not finish/);
    expect(sentence).toMatch(/tries it again on its own/);
  });

  it('a fresh run that died before its first tool still says it has not been started', () => {
    expect(deadRunSentence({ engineWord: 'Codex', cause: 'unknown' })).toMatch(/has not been started/);
  });

  it('says partway through when the cause has words for that', () => {
    expect(deadRunSentence({ engineWord: 'Codex', cause: 'interrupted', partway: true })).toMatch(/^Codex was cut off partway through/);
  });

  it('keeps a reason that stopped this run before it began', () => {
    for (const cause of ['open-elsewhere', 'model-not-on-plan', 'workspace']) {
      const sentence = deadRunSentence({ engineWord: 'Codex', cause, partway: true });
      expect(sentence).not.toMatch(/stopped partway through and did not finish/);
      expect(sentence.startsWith(`Codex ${deadRunSentence({ engineWord: '', cause }).trim().split('.')[0]}`)).toBe(true);
    }
  });
});
