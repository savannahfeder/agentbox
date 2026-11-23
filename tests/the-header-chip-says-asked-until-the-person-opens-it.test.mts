// THE HEADER CHIP SAYS ASKED UNTIL THE PERSON OPENS IT (w-f702d60afe, round twelve, 2026-11-20).
//
// Both testers asked the other for a review and read the thread's header at
// once: "Theo is reviewing", while the board row beside it said "Asked Theo for
// a review" and Theo had not opened anything. The chip built its own label;
// it uses the board's now, from the same read marks.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AsksChip } from '../renderer/src/team/AsksLine.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const people = [{ id: 'sam', name: 'Sam Ortiz' }, { id: 'theo', name: 'Theo Okafor' }];
const thread = { id: 'w-1', product: 'api', title: 'Health endpoint', status: 'open' };
const ask = { id: 't1', product: 'dm', labels: ['given-task'], status: 'open', assignee: 'theo', createdBy: 'sam', createdAt: 100,
  ask: { kind: 'review', owner: 'sam', thread: 'w-1', product: 'api' }, wrote: { ask: { by: 'sam', ts: 100 } } };
const chip = (seen: number) => renderToStaticMarkup(React.createElement(TeamContext.Provider, {
  value: { me: 'sam', byId: new Map(people.map((p) => [p.id, p])), products: new Map(), state: { seen: seen ? { 'dm/t1': { theo: seen } } : {} } } as never,
}, React.createElement(AsksChip, { item: thread as never, items: [ask] as never, onTakeBack: () => {} }))).replace(/<[^>]+>/g, '');

describe('the chip over a thread you asked about', () => {
  it('says it was asked while they have not opened it', () => {
    expect(chip(0)).toMatch(/Asked Theo for a review$/);
    expect(chip(0)).not.toContain('is reviewing');
  });
  it('says they are reviewing once they have', () => {
    expect(chip(150)).toMatch(/Theo is reviewing$/);
  });
});
