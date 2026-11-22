// Asking Theo to review again while his first ask was still open drew his face twice on the thread's
// header chip, one per ask row (tester issue 46). Measured by counting faces in the chip's markup.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AsksChip } from '../renderer/src/team/AsksLine.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const people = [{ id: 'sam', name: 'Sam Ortiz' }, { id: 'theo', name: 'Theo Okafor' }, { id: 'priya', name: 'Priya Shah' }];
const thread = { id: 'w-1', product: 'api', title: 'Health endpoint', status: 'open' };
const ask = (id: string, to: string, at: number) => ({ id, product: 'dm', labels: ['given-task'], status: 'open', assignee: to, createdBy: 'sam', createdAt: at,
  ask: { kind: 'review', owner: 'sam', thread: 'w-1', product: 'api' }, wrote: { ask: { by: 'sam', ts: at } } });
const faces = (rows: object[]) => {
  const html = renderToStaticMarkup(React.createElement(TeamContext.Provider, {
    value: { me: 'sam', byId: new Map(people.map((p) => [p.id, p])), products: new Map(), state: { seen: {} } } as never,
  }, React.createElement(AsksChip, { item: thread as never, items: rows as never, onTakeBack: () => {} })));
  const strip = html.slice(html.indexOf('class="asks-faces"'), html.indexOf('</button>'));
  return (strip.match(/>[A-Z]{1,2}</g) ?? []).sort();
};

describe('the faces on the asks chip', () => {
  it('draws Theo once when he was asked twice, the reported one', () => {
    expect(faces([ask('t1', 'theo', 100), ask('t2', 'theo', 200)])).toEqual(['>TO<']);
  });
  it('draws two people asked once each as two faces', () => {
    expect(faces([ask('t1', 'theo', 100), ask('t2', 'priya', 200)])).toEqual(['>PS<', '>TO<']);
  });
});
