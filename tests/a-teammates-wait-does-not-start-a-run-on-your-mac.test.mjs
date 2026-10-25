// blockedBy is a teammate-settable shared field, but it is NOT in mayRunHere's
// STARTS_A_RUN list, so a teammate could mark your blocked row as waiting on one
// of your running rows and, when that row finished, make your Mac reopen and
// spawn on it — against the stated rule that a teammate's word never starts a
// run here. Measured with the real `resumeFinishedWaits`: before the fix a
// teammate-authored wait resumed; after, only a wait you wrote (or one with no
// writer, i.e. your own agent or solo) does.
import { describe, it, expect, afterEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';

const ME = 'p-me';
const prev = process.env.AGENTBOX_PERSON_ID;
afterEach(() => {
  if (prev === undefined) delete process.env.AGENTBOX_PERSON_ID;
  else process.env.AGENTBOX_PERSON_ID = prev;
});

// w-r is blocked on w-x; the wait is written by `waitBy`; w-x finishes AFTER the
// wait was written (so the resume rule's ordering guard is satisfied).
const build = (waitBy) => {
  const map = foldWorkItems([
    { id: 'w-x', ts: 10, source: 'agent', patch: { title: 'x', status: 'open' } },
    { id: 'w-r', ts: 20, source: 'agent', patch: { title: 'r', status: 'open' } },
    { id: 'w-r', ts: 30, source: 'agent', by: waitBy, patch: { status: 'blocked', blockedBy: ['w-x'] } },
    { id: 'w-x', ts: 40, source: 'agent', patch: { status: 'done' } },
  ]);
  return [...map.values()].map((it) => { it.product = 'acme'; return it; });
};

const sup = () => Object.assign(Object.create(Supervisor.prototype), {
  sessions: new Map(),
  store: { listProducts: () => [{ slug: 'acme', name: 'Acme', dir: '/tmp/acme', repoPath: null }], answerItem: () => {} },
  _resumedWaits: new Set(),
  _resumeQueue: new Set(),
  _waitsSince: 0,
  _saveState: () => {},
});

describe('a teammate-written wait does not start a run on your Mac', () => {
  it('resumes a wait you wrote yourself', () => {
    process.env.AGENTBOX_PERSON_ID = ME;
    expect(sup().resumeFinishedWaits(build(ME))).toEqual(['w-r']);
  });
  it('resumes a wait with no writer (your own agent, or solo)', () => {
    process.env.AGENTBOX_PERSON_ID = ME;
    expect(sup().resumeFinishedWaits(build(null))).toEqual(['w-r']);
  });
  it('does NOT resume a wait a teammate wrote', () => {
    process.env.AGENTBOX_PERSON_ID = ME;
    expect(sup().resumeFinishedWaits(build('p-teammate'))).toEqual([]);
  });
});
