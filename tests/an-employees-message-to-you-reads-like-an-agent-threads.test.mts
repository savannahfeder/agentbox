// AN EMPLOYEE'S MESSAGE TO YOU READS LIKE AN AGENT THREAD'S.
//
// The owner, on a Security lead's message in their inbox: "when employees send
// me messages they're much different than agent threads... the agent thread
// messages were engineered to give the optimal amount of information and
// present in the best way." That message was 400 characters of one paragraph
// with no bold line, and the owner had to reply "explain these". A teammate's
// run had the worker's last-message rules cut out of its system prompt and a
// chat rule ("a line or two, no bold line") put in their place, so every
// employee wrote that way. Measured by building the system prompt both ways
// below: the teammate's lacked the bold-line and 200-word rules.
//
// What must not change: the team chat (team_post, team_tell) stays a line or
// two, and a plain worker's system prompt stays byte for byte.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mts';
import { howYourRunEnds, howYouWrite } from '../shared/teammates.mts';
import { messageDocuments } from '../renderer/src/message-artifacts.ts';

const BRIEF = '# You are Security lead: a teammate';
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const supervisor = (briefFor?: () => string | null) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teammate-last-'));
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true, ...(briefFor ? { teammates: { briefFor } } : {}) };
  return new Supervisor({ storeRoot: dir, maxConcurrentSessions: 1 }, store, REPO, REPO, dir);
};
const item = (labels = ['founder']) => ({ id: 'w-1a2b3c4d5e', product: 'p', title: 'A run', body: 'Do it.', labels });
const product = { slug: 'p', dir: os.tmpdir(), repoPath: null };
const systemOf = (sup: Supervisor, row: ReturnType<typeof item>) => sup.spawnPlan(row, product, { engine: 'claude' }).system as string;
const WORKER_LAST_MESSAGE = [
  'This is about the LAST message you send',
  '**Line one is the thing they have to say back, in bold',
  'Under 200 words',
  'LINE ONE AND THE OPTIONS ARE ONE QUESTION',
  '## Options\n1. The move you would make (recommended)',
  'WHAT THE APP CAN SHOW',
];

describe('an employee\'s thread', () => {
  const sup = supervisor(() => BRIEF);
  const system = systemOf(sup, item(['founder', 'teammate:t-abc123']));

  it('carries the same last-message rules as an agent thread, whole', () => {
    for (const rule of WORKER_LAST_MESSAGE) expect(system).toContain(rule);
    expect(system).toContain(sup.messageRules()!);
  });

  it('ends on a rule that points at them and keeps the employee\'s voice', () => {
    expect(system.endsWith(howYourRunEnds())).toBe(true);
    expect(howYourRunEnds()).toMatch(/bold/);
    expect(howYourRunEnds()).toMatch(/your voice/i);
    expect(howYourRunEnds()).not.toMatch(/no bold/i);
    expect(howYourRunEnds()).not.toMatch(/a line or two, then stop/i);
  });

  it('says the short chat rules are for the team chat, not this message', () => {
    expect(howYourRunEnds()).toMatch(/team_post/);
    expect(howYourRunEnds()).toMatch(/team_tell/);
  });
});

describe('the team chat stays a chat', () => {
  it('team_post and team_tell are still a line or two', () => {
    const chat = howYouWrite({ name: 'Security lead', role: 'security' } as Parameters<typeof howYouWrite>[0]);
    expect(chat).toMatch(/In a chat \(team_post, team_tell\)[^\n]*a line or two/);
  });
});

describe('a plain worker\'s thread', () => {
  it('has no such rule, and the same system prompt as a run with no teammate brief at all', () => {
    const plain = systemOf(supervisor(() => null), item());
    expect(plain).toBe(systemOf(supervisor(), item()));
    expect(plain).not.toContain(howYourRunEnds());
    for (const rule of WORKER_LAST_MESSAGE) expect(plain).toContain(rule);
  });

  it('a teammate label with no teammate behind it stays a plain run', () => {
    expect(systemOf(supervisor(() => null), item(['teammate:t-gone']))).not.toContain(howYourRunEnds());
  });

  it('a brief that fails to read leaves a plain run, not half of each', () => {
    const sup = supervisor(() => { throw new Error('no chat'); });
    expect(systemOf(sup, item(['teammate:t-abc123']))).not.toContain(howYourRunEnds());
  });
});

describe('the briefs say the same', () => {
  it('the teammate brief asks for the bold line, not a line or two', () => {
    const brief = fs.readFileSync(new URL('../main/teammates.mts', import.meta.url), 'utf8');
    expect(brief).not.toMatch(/end this run with that as your answer: a line or two/);
    expect(brief).toMatch(/end this run with that as your answer, written like any agent thread\\?'s last message/);
  });

  it('the worker brief\'s teammate part says the same', () => {
    const worker = fs.readFileSync(new URL('../briefs/worker.md', import.meta.url), 'utf8');
    const part = worker.match(/<!-- teammate-rules:start -->[\s\S]*?<!-- teammate-rules:end -->/)![0];
    expect(part).not.toMatch(/a line or two, then numbered options/);
    expect(part).toMatch(/bold line/);
  });
});

describe('the card a document gets', () => {
  it('draws for a file named in a sentence', () => {
    expect(messageDocuments({ result: 'Launch plan is ready, with three dates to check: launch-plan.md' })).toEqual(['launch-plan.md']);
    expect(messageDocuments({ result: 'I wrote the plan up in launch-plan.md for you.' })).toEqual(['launch-plan.md']);
  });

  it('draws nothing for a short answer with no file', () => {
    expect(messageDocuments({ result: 'Jordan has not answered, and the double booking has no fix yet.' })).toEqual([]);
  });
});
