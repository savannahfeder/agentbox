// WHAT A PRESS SAYS IS WHAT HAPPENED, AND ONE PRESS IS ONE SEND.
//
// Dev pressed "Don't send it" and the line over the reply box said "Sent to
// Sofia": SentLine always says "Sent to", and on an approval row its title is the
// audience. Sofia pressed "Send v2 to Dev" and 7 minutes later was asked again, because
// her agent's team_tell was a first write and nothing read that she had just said so.
// Maya's Chief of staff chat read "waiting for a free agent" 2 hours after the thread
// was answered, because the line asks only for a running row with no session.
// A thread about the app started in Company, whose repository holds one README, so
// agents answered "no page code in repo".
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pickSentWords, sentLineSays } from '../renderer/src/advance.ts';
import { DONT_SEND, SEND_ONCE, saidToSendTo, mayGoNow } from '../shared/teammate-reach.mjs';
import { hasCode } from '../shared/has-code.mjs';
import { codeProjectFor } from '../renderer/src/compose-project.ts';
import { liveLine } from '../renderer/src/teammates/chat-lines.ts';

describe('the line after a decision on a message', () => {
  it('says it did not go', () => {
    expect(pickSentWords(DONT_SEND, 'Sofia')).toBe('Not sent to Sofia');
    expect(sentLineSays(pickSentWords(DONT_SEND, 'Sofia'))).toBe('Not sent to');
  });
  it('says it went when it did', () => {
    expect(sentLineSays(pickSentWords(SEND_ONCE, 'Sofia'))).toBe('Sent to');
    expect(sentLineSays(pickSentWords('Keep the blue one', 'Onboarding'))).toBe('Sent to');
  });
});

describe('one press, one send', () => {
  const lines = (answer) => [{ source: 'agent', ts: 1, patch: { result: 'Options' } }, { source: 'founder', ts: 2, patch: { answer } }];
  const dev = { id: 'dev', name: 'Dev Patel' };

  it('a pick that says to send to them is their owner\'s yes', () => {
    expect(saidToSendTo(lines('Option 1: Send v2 to Dev'), [dev])).toBe(true);
  });
  it('so is plain words', () => {
    expect(saidToSendTo(lines('yes, tell dev it is ready'), [dev])).toBe(true);
  });
  it('words aimed at the owner are not', () => {
    expect(saidToSendTo(lines('Tell me what Dev thinks'), [dev])).toBe(false);
    expect(saidToSendTo(lines('Send me what Dev wrote'), [dev])).toBe(false);
  });
  it('someone else named is not', () => {
    expect(saidToSendTo(lines('Option 1: Send v2 to Sofia'), [dev])).toBe(false);
  });
  it('naming them without saying to send is not', () => {
    expect(saidToSendTo(lines('Dev has it wrong, leave it'), [dev])).toBe(false);
  });
  it('saying not to is not', () => {
    expect(saidToSendTo(lines("Don't send it to Dev"), [dev])).toBe(false);
    expect(saidToSendTo(lines('Do not tell Dev yet'), [dev])).toBe(false);
  });
  it('a teammate\'s words, or an agent\'s, are no yes', () => {
    expect(saidToSendTo([{ source: 'system', ts: 2, patch: { answer: 'Send v2 to Dev', from: { teammate: 'x', name: 'X' } } }], [dev])).toBe(false);
    expect(saidToSendTo([{ source: 'agent', ts: 2, patch: { result: 'Send v2 to Dev' } }], [dev])).toBe(false);
  });
  it('an old yes is spent once the agent has answered since', () => {
    expect(saidToSendTo([...lines('Send v2 to Dev'), { source: 'agent', ts: 3, patch: { result: 'Sent.' } }], [dev])).toBe(false);
  });
  it('every person in the audience must be named', () => {
    expect(saidToSendTo(lines('Send it to Dev'), [dev, { id: 's', name: 'Sofia Reyes' }])).toBe(false);
  });
  it('lets the message go; meant to leave the team, it still asks', () => {
    const out = { people: ['dev'], from: { mate: null }, saidYes: true };
    expect(mayGoNow(out, new Set())).toBe(true);
    expect(mayGoNow({ ...out, outside: true }, new Set())).toBe(false);
    expect(mayGoNow({ ...out, saidYes: false }, new Set())).toBe(false);
  });
});

describe('the waiting line', () => {
  const t = { name: 'Chief of staff', running: { id: 'w-1' }, now: null };
  it('says it waits while the run has not got an agent', () => {
    expect(liveLine(t, null, Date.now())?.state).toBe('waiting');
  });
  it('is gone once its thread was answered', () => {
    expect(liveLine(t, null, Date.now(), null, { answered: true })).toBeNull();
  });
});

describe('which project holds the code', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'has-code-'));
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = (name, ...files) => {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(dir, f), 'x');
    return dir;
  };
  it('a repository with only a README, or hidden files, has none', () => {
    expect(hasCode(repo('a', 'README.md', '.gitignore'))).toBe(false);
    expect(hasCode(repo('b'))).toBe(false);
    expect(hasCode(null)).toBe(false);
  });
  it('one with anything else has', () => {
    expect(hasCode(repo('c', 'README.md', 'package.json'))).toBe(true);
  });

  const company = { slug: 'company', name: 'Company', code: false };
  const app = { slug: 'lumen-app', name: 'Lumen app', code: true };
  it('a thread about the app goes to the project with the code', () => {
    expect(codeProjectFor('Restyle the onboarding page: blue Continue button', [company, app], 'company')?.slug).toBe('lumen-app');
  });
  it('a thread about a document stays', () => {
    expect(codeProjectFor('Write the investor update', [company, app], 'company')).toBeNull();
  });
  it('a project with code of its own stays', () => {
    expect(codeProjectFor('Fix the bug', [company, app], 'lumen-app')).toBeNull();
  });
  it('two projects with code: it does not guess', () => {
    expect(codeProjectFor('Fix the bug', [company, app, { slug: 'x', name: 'X', code: true }], 'company')).toBeNull();
  });
  it('a thread that names its project stays there', () => {
    expect(codeProjectFor('In Company, fix the bug in our page copy', [company, app], 'company')).toBeNull();
  });
  it('the card says where it goes and a press keeps the old one; a hand-picked project never moves', () => {
    const card = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/threads/ThreadComposer.tsx'), 'utf8');
    expect(card).toContain('!productSlug && pointedAt ? codeProjectFor(');
    expect(card).toContain('where the code is');
    expect(card).toContain('Keep {pointedAt!.name}');
  });
  it('chats are not projects', () => {
    expect(codeProjectFor('Fix the bug', [company, { ...app, team: { direct: true } }], 'company')).toBeNull();
  });
});
