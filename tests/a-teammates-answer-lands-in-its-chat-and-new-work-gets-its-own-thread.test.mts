// QA batch 011 (F-183, F-190, F-191), measured on a Linux QA box on Oct 30
// and 31, 2026. A Chief of staff finished its setup with "Setup is complete";
// that run counted as waiting on you, so every later message in its chat went
// into it as an "answer". A question ("what does chunk() return for an empty
// array?") and then "get an agent to add a README to the truncate-js project"
// both landed in the thread titled "Set up its job", labelled Chunk JS. The
// answer never showed in the chat, only as a Needs you row, and the README was
// written by that run straight into the truncate-js checkout, which it moved
// onto a new branch, because nothing gave it a thread of its own in Truncate JS.
//
// These pin, on plain data: your words go into a waiting run only when that run
// asked you something; a chat run that answered without asking says its answer
// in the chat and closes quietly; a message that names one project starts its
// run there; and a teammate can pass work to itself in another project.
import { describe, it, expect } from 'vitest';
import {
  planWakes, runIdFor, teammateLabel, asksSomething, projectNamedIn, replyMessageId, CHAT_LABEL, DEFAULT_LIMIT,
} from '../shared/teammates.mts';

const NOW = new Date(2026, 9, 31, 1, 5).getTime();
const chief = { id: 't-c0c0c0', name: 'Chief of staff', letter: 'C', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'chunk-js', memory: [], primary: true };
const chat = (messages, seen = []) => ({ messages, seen: new Set(seen) });
const finished = (over = {}) => ({
  id: 'w-8090f5f490c7', product: 'chunk-js', title: 'Set up its job', status: 'open',
  labels: ['founder', teammateLabel(chief.id), CHAT_LABEL], createdAt: NOW - 60_000,
  result: 'Setup is complete. I saved your rules and will wait for your next task.',
  wrote: { result: { ts: NOW - 30_000, source: 'agent' } }, ...over,
});
const ask = (text, over = {}) => ({ id: 'm-readme', kind: 'msg', from: 'you', to: [chief.id], text, ts: NOW, ...over });

describe('which of a teammate\'s replies ask you something', () => {
  it('a question mark or an Options section asks; a plain answer does not', () => {
    expect(asksSomething('What name and email should I use for the commit?')).toBe(true);
    expect(asksSomething('Want the full list?')).toBe(true);
    expect(asksSomething('Drafted the post.\n\n## Options\n1. Post it (recommended)\n2. Change it first')).toBe(true);
    expect(asksSomething('Is it "ready?"')).toBe(true);
    expect(asksSomething('chunk() returns [] for an empty array. The loop in index.js never runs.')).toBe(false);
    expect(asksSomething('Setup is complete. I\'ll wait for your next task.')).toBe(false);
    // A question mark inside a link or code is not a question to you.
    expect(asksSomething('It is at https://example.com/a?b=1 now.')).toBe(false);
    expect(asksSomething('')).toBe(false);
  });
});

describe('your next message after a teammate answered', () => {
  it('starts new work when the waiting run asked you nothing (F-191)', () => {
    const acts = planWakes({ teammates: [chief], chat: chat([ask('What does chunk() return for an empty array?')]), items: [finished()], now: NOW });
    expect(acts.find((a) => a.type === 'answer')).toBeUndefined();
    expect(acts.find((a) => a.type === 'run')).toMatchObject({ teammate: chief.id, id: runIdFor(`m-readme>${chief.id}`) });
  });

  it('still goes into a run that asked you a question, or ended with options, or is held', () => {
    for (const over of [
      { result: 'What name and email should I use for the commit?' },
      { result: 'README is written.\n\n## Options\n1. Ship it (recommended)\n2. Throw it away' },
      { status: 'blocked' },
    ]) {
      const acts = planWakes({ teammates: [chief], chat: chat([ask('Use the defaults')]), items: [finished(over)], now: NOW });
      expect(acts).toContainEqual(expect.objectContaining({ type: 'answer', item: 'w-8090f5f490c7' }));
      expect(acts.find((a) => a.type === 'run')).toBeUndefined();
    }
  });

  it('goes into a run whose question in the chat is still open', () => {
    const q = { id: 'm-q', kind: 'msg', from: chief.id, to: [], text: 'Which branch?', options: ['main', 'dev'], run: 'w-8090f5f490c7', ts: NOW - 20_000 };
    const acts = planWakes({ teammates: [chief], chat: chat([q, ask('dev')], [`m-q>${chief.id}`]), items: [finished({ result: 'One question first.' })], now: NOW });
    expect(acts).toContainEqual(expect.objectContaining({ type: 'answer', item: 'w-8090f5f490c7' }));
  });
});

describe('a chat run that answered without asking (F-183)', () => {
  it('says its answer in the chat and closes quietly', () => {
    const run = finished({ result: 'chunk() returns [] for an empty array.' });
    const acts = planWakes({ teammates: [chief], chat: chat([]), items: [run], now: NOW });
    expect(acts).toContainEqual({ type: 'replied', teammate: chief.id, item: run.id, product: 'chunk-js', labels: run.labels, text: 'chunk() returns [] for an empty array.', say: true });
  });

  it('does not say it twice once the chat has it, and still closes', () => {
    const run = finished({ result: 'chunk() returns [].' });
    const said = { id: replyMessageId(run.id), kind: 'msg', from: chief.id, to: [], text: 'chunk() returns [].', run: run.id, ts: NOW - 10 };
    const acts = planWakes({ teammates: [chief], chat: chat([said]), items: [run], now: NOW });
    expect(acts).toContainEqual(expect.objectContaining({ type: 'replied', item: run.id, say: false }));
  });

  it('does not repeat what the run already posted to you in the chat', () => {
    const run = finished({ result: 'Done: README added.' });
    const posted = { id: 'm-p', kind: 'msg', from: chief.id, to: [], text: 'Added the README in Truncate JS.', run: run.id, ts: NOW - 40_000 };
    const acts = planWakes({ teammates: [chief], chat: chat([posted], [`m-p>${chief.id}`]), items: [run], now: NOW });
    expect(acts).toContainEqual(expect.objectContaining({ type: 'replied', item: run.id, say: false }));
  });

  it('leaves alone a run that asks, a run still being set up, a run nobody started from the chat, and one already closed', () => {
    const none = (teammate, item) => planWakes({ teammates: [teammate], chat: chat([]), items: [item], now: NOW }).filter((a) => a.type === 'replied');
    expect(none(chief, finished({ result: 'Ship it?' }))).toEqual([]);
    expect(none({ ...chief, status: 'draft' }, finished())).toEqual([]);
    expect(none(chief, finished({ labels: ['founder', teammateLabel(chief.id)] }))).toEqual([]);
    expect(none(chief, finished({ status: 'done' }))).toEqual([]);
    expect(none(chief, finished({ status: 'claimed' }))).toEqual([]);
    expect(none(chief, finished({ labels: ['founder', teammateLabel(chief.id), CHAT_LABEL, 'clean'] }))).toEqual([]);
    // Answered by you since: it is working on that, not finished.
    expect(none(chief, finished({ wrote: { result: { ts: NOW - 30_000, source: 'agent' }, answer: { ts: NOW - 10_000, source: 'founder' } } }))).toEqual([]);
  });
});

describe('the project a message names (F-190, F-191)', () => {
  const products = [
    { slug: 'chunk-js', name: 'Chunk JS' }, { slug: 'truncate-js', name: 'Truncate JS' },
    { slug: 'pluralize-js', name: 'Pluralize JS' }, { slug: 'git', name: 'Git' },
  ];
  it('is found by its name or its folder name', () => {
    expect(projectNamedIn('Please get an agent to add a README.md to the truncate-js project explaining what truncate() does.', products)).toBe('truncate-js');
    expect(projectNamedIn('add a short README.md to the pluralize-js project (Pluralize JS)', products)).toBe('pluralize-js');
    expect(projectNamedIn('In the Chunk JS project at /workspace/agentbox-test-repos/chunk-js, what does chunk() return?', products)).toBe('chunk-js');
  });

  it('is nothing when none or two are named, and a one-word name needs the word project beside it', () => {
    expect(projectNamedIn('what is on today?', products)).toBeNull();
    expect(projectNamedIn('move the helper from Chunk JS into Truncate JS', products)).toBeNull();
    expect(projectNamedIn('run git status and tell me', products)).toBeNull();
    expect(projectNamedIn('clean up the Git project', products)).toBe('git');
    expect(projectNamedIn('truncatejs', products)).toBeNull();
  });

  it('starts the run in that project rather than the teammate\'s own', () => {
    const acts = planWakes({ teammates: [chief], chat: chat([ask('add a README to the truncate-js project', { product: 'truncate-js' })]), items: [], now: NOW });
    expect(acts.find((a) => a.type === 'run').trigger).toMatchObject({ kind: 'message', product: 'truncate-js' });
  });
});

describe('a teammate passing work to itself in another project (F-190)', () => {
  const sender = { id: 'w-aaaaaaaaaaaa', product: 'chunk-js', status: 'claimed', labels: ['founder', teammateLabel(chief.id), `work:w-aaaaaaaaaaaa`], createdAt: NOW - 5000, wrote: {} };
  const pass = (over = {}) => ({ id: 'm-self', kind: 'pass', from: chief.id, to: chief.id, title: 'Add a README', details: 'Keep it tiny.', product: 'truncate-js', run: sender.id, work: sender.id, hop: 0, yours: true, ts: NOW, ...over });

  it('makes a run of its own in that project, queued behind the run that passed it', () => {
    const acts = planWakes({ teammates: [chief], chat: chat([pass()]), items: [sender], now: NOW });
    const run = acts.find((a) => a.type === 'run');
    expect(run).toMatchObject({ teammate: chief.id, start: 'later', trigger: { kind: 'pass', product: 'truncate-js' } });
    expect(run.trigger.hold).toBeUndefined();
  });

  it('waits for your yes when your words did not ask for it', () => {
    const acts = planWakes({ teammates: [chief], chat: chat([pass({ yours: false })]), items: [sender], now: NOW });
    expect(acts.find((a) => a.type === 'run').trigger).toMatchObject({ hold: true });
  });

  it('wakes nothing when it names no project, and a message to itself still wakes nothing', () => {
    expect(planWakes({ teammates: [chief], chat: chat([pass({ product: undefined })]), items: [sender], now: NOW }).filter((a) => a.type === 'run')).toEqual([]);
    const self = { id: 'm-me', kind: 'msg', from: chief.id, to: [chief.id], text: 'note to self', product: 'truncate-js', ts: NOW };
    expect(planWakes({ teammates: [chief], chat: chat([self]), items: [sender], now: NOW }).filter((a) => a.type === 'run')).toEqual([]);
  });
});
