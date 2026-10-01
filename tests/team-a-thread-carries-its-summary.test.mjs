// A THREAD CARRIES ITS SUMMARY, AND THE LATER WRITE OF IT WINS.
//
// The team version (approved 2026-10-01) gives every thread a summary: a
// problem, a progress line and a solution, plus what blocks it and what it
// blocks. The agent keeps it current; the person can edit it in place. On every
// other field the person's word outranks an agent's forever, which here would
// mean one edit freezes the summary the agent is there to keep up to date, so
// these fields go to whoever wrote last. Visibility is the person's: team or
// private, per thread.
import { describe, it, expect } from 'vitest';
import { foldWorkItems } from '../shared/work-items.mjs';

const T = 1_000_000;
const line = (ts, source, patch) => ({ id: 'w-1', ts, source, patch });
const fold = (lines) => foldWorkItems(lines, T + 10_000).get('w-1');

describe('the summary', () => {
  it('is written by the agent and read back whole', () => {
    const item = fold([
      line(T, 'founder', { title: 'Acme renewal terms', status: 'open' }),
      line(T + 1, 'agent', { problem: 'Contract ends on the 14th.', progress: 'Usage pulled.', solution: 'One page of terms.', blockedBy: ['w-2', 'w-2'], blocks: ['w-3'] }),
    ]);
    expect(item).toMatchObject({ problem: 'Contract ends on the 14th.', progress: 'Usage pulled.', solution: 'One page of terms.', blockedBy: ['w-2'], blocks: ['w-3'] });
  });

  it('takes the person\'s edit, and then the agent\'s next update over it', () => {
    const item = fold([
      line(T, 'founder', { title: 'x', status: 'open' }),
      line(T + 1, 'agent', { progress: 'Usage pulled.' }),
      line(T + 2, 'founder', { progress: 'Waiting on Maya for the call.' }),
      line(T + 3, 'agent', { progress: 'Terms drafted at 8%.' }),
    ]);
    expect(item.progress).toBe('Terms drafted at 8%.');
    expect(item.wrote.progress.source).toBe('agent');
  });

  it('can be cleared by an empty line', () => {
    const item = fold([line(T, 'founder', { title: 'x' }), line(T + 1, 'agent', { solution: 'Something.' }), line(T + 2, 'founder', { solution: '  ' })]);
    expect(item.solution).toBe('');
  });

  it('leaves the person\'s word on every other field outranking the agent', () => {
    const item = fold([line(T, 'founder', { title: 'Hers' }), line(T + 1, 'agent', { title: 'An agent\'s' })]);
    expect(item.title).toBe('Hers');
  });
});

describe('visibility', () => {
  it('is team or private and nothing else', () => {
    expect(fold([line(T, 'founder', { title: 'x', visibility: 'private' })]).visibility).toBe('private');
    expect(fold([line(T, 'founder', { title: 'x', visibility: 'everyone' })]).visibility).toBeUndefined();
  });
});
