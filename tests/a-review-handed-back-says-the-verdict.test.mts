// A REVIEW HANDED BACK SAYS THE VERDICT (w-f702d60afe, round six, 2026-11-20).
//
// The PM tester answered a review with Needs changes and read the task
// afterwards: "The screen says Review · you handed this back and shows my
// feedback ... but does not show Needs changes. I cannot tell from here
// whether Priya received a change request." The line under the task's name
// said "handed this back" whatever the verdict was.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeamSaid } from '../renderer/src/team/TeamFocus.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const people = [{ id: 'dana', name: 'Dana Whitfield' }, { id: 'priya', name: 'Priya Shah' }];
const ctx = (me: string) => ({
  me, byId: new Map(people.map((p) => [p.id, p])),
  products: new Map([['dm', { slug: 'dm', team: { direct: true } }]]),
  state: {},
});
const task = (o: Record<string, unknown> = {}) => ({
  id: 't', product: 'dm', productName: 'Dana', labels: ['given-task'], status: 'done', assignee: 'dana', people: ['priya', 'dana'], createdBy: 'priya',
  ask: { kind: 'review', owner: 'priya', thread: 'w', product: 'web' }, wrote: { status: { by: 'dana', ts: 1 } }, ...o,
});
const said = (me: string, o?: Record<string, unknown>) => renderToStaticMarkup(
  React.createElement(TeamContext.Provider, { value: ctx(me) as never }, React.createElement(TeamSaid, { item: task(o) as never })),
).replace(/<[^>]+>/g, '');

describe('the line under a review that was handed back', () => {
  it('says changes were asked for, to the reviewer and to the one who asked', () => {
    expect(said('dana', { verdict: 'changes' })).toContain('you asked for changes');
    expect(said('priya', { verdict: 'changes' })).toContain('Dana asked for changes');
  });
  it('says it looks good', () => {
    expect(said('dana', { verdict: 'yes' })).toContain('you said it looks good');
    expect(said('priya', { verdict: 'yes' })).toContain('Dana said it looks good');
  });
  it('says handed back for help, which has no verdict to tell', () => {
    expect(said('dana', { verdict: 'done', ask: { kind: 'help', owner: 'priya', thread: 'w', product: 'web' } })).toContain('you handed this back');
  });
  it('still says it, after a thank-you from an older copy reopened the task', () => {
    expect(said('priya', { verdict: 'yes', status: 'open', wrote: { status: { by: 'priya', ts: 2 }, verdict: { by: 'dana', ts: 1 } } })).toContain('Dana said it looks good');
  });
  it('says taken back when the one who asked closed it', () => {
    expect(said('dana', { wrote: { status: { by: 'priya', ts: 1 } } })).toContain('Priya took this back');
  });
});
