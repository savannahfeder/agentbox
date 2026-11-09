// A TEAMMATE'S LAST MESSAGE FOLLOWS THE CHAT RULES.
//
// The owner: "they write really big blocks of text." Team_post and team_tell were
// cut down, but a teammate's last message on a thread still followed the worker's
// rules: in the Lumen stores those answers ran to 668 (median), 1,064, 1,366, 1,502
// and 1,726 characters. A teammate's last message is now a line or two, with a
// document card when there is more. Real `claude -p` numbers are in the commit.
//
// What must not change: a plain worker's last message, which is a separate
// contract set by the owner's brief. Its system prompt stays byte for byte.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mts';
import { howYourRunEnds } from '../shared/teammates.mts';
import { messageDocuments } from '../renderer/src/message-artifacts.ts';

const BRIEF = '# You are Ops lead: a teammate';
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const supervisor = (briefFor) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teammate-last-'));
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true, ...(briefFor ? { teammates: { briefFor } } : {}) };
  return new Supervisor({ storeRoot: dir, maxConcurrentSessions: 1 }, store, REPO, REPO, dir);
};
const item = (labels = ['founder']) => ({ id: 'w-1a2b3c4d5e', product: 'p', title: 'A run', body: 'Do it.', labels });
const product = { slug: 'p', dir: os.tmpdir(), repoPath: null };
const systemOf = (sup, row) => sup.spawnPlan(row, product, { engine: 'claude' }).system;

describe('a teammate\'s thread', () => {
  const system = systemOf(supervisor(() => BRIEF), item(['founder', 'teammate:t-abc123']));
  const rule = howYourRunEnds();

  it('ends on this rule, with the worker\'s rules for a last message taken out', () => {
    expect(system.endsWith(rule)).toBe(true);
    for (const worker of ['This is about the LAST message you send', 'Line one is the thing they have to say back', 'Under 200 words,', 'the ask sets the size']) {
      expect(system).not.toContain(worker);
    }
  });

  it('keeps what the app can show, and how to offer options', () => {
    expect(system).toContain('A PICTURE YOU SHOW IS SAVED');
    expect(system).toContain('WHAT THE APP CAN SHOW');
    expect(system).toContain('If one step is blocked');
    expect(system).toContain('## Options\n1. The move you would make (recommended)');
  });

  it('says a line or two, and no bold line, heading or list', () => {
    expect(rule).toMatch(/a line or two/i);
    expect(rule).toMatch(/no bold/i);
    expect(rule).toMatch(/heading/i);
    expect(rule).toMatch(/list/i);
  });

  it('says more goes in a document first, named in one sentence, even when asked for detail', () => {
    expect(rule).toMatch(/write_document/);
    expect(rule).toMatch(/one sentence/);
    expect(rule).toMatch(/even when/i);
  });

  it('keeps the options, which are how a decision is answered in a tap', () => {
    expect(rule).toMatch(/## Options/);
  });
});

describe('a plain worker\'s thread', () => {
  it('has no such rule, and the same system prompt as a run with no teammate brief at all', () => {
    const plain = systemOf(supervisor(() => null), item());
    expect(plain).toBe(systemOf(supervisor(), item()));
    expect(plain).not.toContain(howYourRunEnds());
    expect(plain).toContain('Under 200 words');
    expect(plain).toContain('**Line one is the thing they have to say back, in bold');
  });

  it('a teammate label with no teammate behind it stays a plain run', () => {
    expect(systemOf(supervisor(() => null), item(['teammate:t-gone']))).not.toContain(howYourRunEnds());
  });

  it('a brief that fails to read leaves a plain run, not half of each', () => {
    const sup = supervisor(() => { throw new Error('no chat'); });
    expect(systemOf(sup, item(['teammate:t-abc123']))).not.toContain(howYourRunEnds());
  });
});

describe('the card a document gets', () => {
  it('draws for a file named in the one sentence', () => {
    expect(messageDocuments({ result: 'Launch plan is ready, with three dates to check: launch-plan.md' })).toEqual(['launch-plan.md']);
    expect(messageDocuments({ result: 'I wrote the plan up in launch-plan.md for you.' })).toEqual(['launch-plan.md']);
  });

  it('draws nothing for a short answer with no file', () => {
    expect(messageDocuments({ result: 'Jordan has not answered, and the double booking has no fix yet.' })).toEqual([]);
  });
});

describe('the brief itself', () => {
  const brief = fs.readFileSync(new URL('../main/teammates.mts', import.meta.url), 'utf8');

  it('no longer asks a teammate for a bold first line', () => {
    expect(brief).not.toMatch(/bold first line/);
    expect(brief).toMatch(/end this run with that as your answer: a line or two, then numbered options, your recommendation first/);
  });

  it('the worker brief\'s teammate part says the same, and only a teammate reads that part', () => {
    const worker = fs.readFileSync(new URL('../briefs/worker.md', import.meta.url), 'utf8');
    const part = worker.match(/<!-- teammate-rules:start -->[\s\S]*?<!-- teammate-rules:end -->/)[0];
    expect(part).not.toMatch(/bold first line/);
    expect(part).toMatch(/a line or two, then numbered options/);
  });
});
