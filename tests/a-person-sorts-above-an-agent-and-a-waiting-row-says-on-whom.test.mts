// A PERSON SORTS ABOVE AN AGENT, AND A WAITING ROW SAYS ON WHOM.
//
// Round two: "Sofia's answer sat at the bottom of Needs you, under older agent
// rows", because a message nobody had levelled carried 0, which reads as Low on
// the sorter, and a tie went to whichever row changed last. A row reading a bare
// WAITING did not say whether it waited on you or on Maya.
import { describe, it, expect } from 'vitest';
import { byPriority, sorted, waitingWord, DEFAULT_DISPLAY } from '../renderer/src/threads/page-rules.ts';
import { cardStatus } from '../renderer/src/status-word.ts';

const DIRECT = new Set(['direct-1']);
const agent = (id, over = {}) => ({ id, priority: 5, updatedAt: 500, product: 'app', ...over });
const message = (id, over = {}) => ({ id, priority: 0, updatedAt: 100, product: 'direct-1', ...over });
const task = (id, over = {}) => ({ id, priority: 5, updatedAt: 100, product: 'app', assignee: 'p-me', ...over });
const ids = (rows, order = []) => rows.slice().sort(byPriority(order, DIRECT)).map((r) => r.id);

describe('under Sort by Priority', () => {
  it('a message with no level sits above an agent thread at Medium, older or not', () => {
    expect(ids([agent('a'), message('m')])).toEqual(['m', 'a']);
  });

  it('a task from a person sits above an agent thread at the same level', () => {
    expect(ids([agent('a'), task('t')])).toEqual(['t', 'a']);
  });

  it('a higher level still comes first', () => {
    expect(ids([agent('a', { priority: 7 }), message('m')])).toEqual(['a', 'm']);
    expect(ids([agent('a', { priority: 9 }), task('t', { priority: 7 })])).toEqual(['a', 't']);
  });

  it('a person at a lower level stays under an agent', () => {
    expect(ids([agent('a'), message('m', { priority: 2 })])).toEqual(['a', 'm']);
  });

  it('two agent threads at one level still run newest first', () => {
    expect(ids([agent('old', { updatedAt: 1 }), agent('new', { updatedAt: 2 })])).toEqual(['new', 'old']);
  });

  it('two people at one level still run newest first', () => {
    expect(ids([message('old', { updatedAt: 1 }), message('new', { updatedAt: 2 })])).toEqual(['new', 'old']);
  });

  it('a project ranked higher still beats a thread given to a person in a lower one', () => {
    expect(ids([agent('a', { product: 'top' }), task('t', { product: 'low' })], ['top', 'low'])).toEqual(['a', 't']);
  });

  it('a row given to an agent is not from a person', () => {
    expect(ids([agent('new', { assignee: 'agent', updatedAt: 2 }), agent('old', { updatedAt: 1 })])).toEqual(['new', 'old']);
  });

  it('a pinned agent thread still comes first', () => {
    const rows = sorted([message('m'), agent('a', { pinned: true })], DEFAULT_DISPLAY.inbox, 'inbox', [], DIRECT);
    expect(rows.map((r) => r.id)).toEqual(['a', 'm']);
  });
});

describe('under Sort by Updated', () => {
  it('a person gets no lift', () => {
    const rows = sorted([message('m', { updatedAt: 1 }), agent('a', { updatedAt: 2, wrote: undefined })], { ...DEFAULT_DISPLAY.inbox, sort: 'updated' }, 'inbox', [], DIRECT);
    expect(rows.map((r) => r.id)).toEqual(['a', 'm']);
  });
});

const ME = 'p-me', MAYA = 'p-maya';
const names = (id) => ({ [MAYA]: 'Maya', 'p-sofia': 'Sofia' }[id] ?? 'Someone');
const onDirect = { slug: 'direct-1', team: { projectId: 'd', people: [ME, MAYA], sharedBy: ME, direct: true } };
const shared = { slug: 'app', team: { projectId: 'x', people: [ME, MAYA], sharedBy: ME } };
const word = (item, product, me = ME) => waitingWord(item, product, me, names);

describe('a teammate\'s card', () => {
  it('says whom it waits on', () => { expect(cardStatus('waiting', 'Maya').word).toBe('Waiting on Maya'); });
  it('says Waiting when no name is known', () => { expect(cardStatus('waiting').word).toBe('Waiting'); });
  it('says nothing of the kind in another state', () => { expect(cardStatus('running', 'Maya').word).toBe('In progress'); });
});

describe('a waiting row', () => {
  it('with nobody signed in, says Waiting', () => { expect(word({}, { slug: 'app' }, null)).toBe('Waiting'); });

  it('on your own agent thread on a team, says Waiting on you', () => {
    expect(word({ createdBy: ME }, { slug: 'solo' })).toBe('Waiting on you');
    expect(word({ createdBy: ME }, shared)).toBe('Waiting on you');
  });

  it('on a message whose last word was theirs, says Waiting on you', () => {
    expect(word({ wrote: { body: { ts: 1, by: MAYA } } }, onDirect)).toBe('Waiting on you');
  });

  it('on a message whose last word was yours, says Waiting on them', () => {
    expect(word({ people: [ME, MAYA], wrote: { body: { ts: 1, by: ME } } }, onDirect)).toBe('Waiting on Maya');
  });

  it('on a task given to you, says Waiting on you', () => {
    expect(word({ assignee: ME }, shared)).toBe('Waiting on you');
  });

  it('on a task given to someone else, says Waiting on them', () => {
    expect(word({ assignee: 'p-sofia' }, shared)).toBe('Waiting on Sofia');
  });

  it('given to an agent, is on you', () => {
    expect(word({ assignee: 'agent' }, shared)).toBe('Waiting on you');
  });
});
