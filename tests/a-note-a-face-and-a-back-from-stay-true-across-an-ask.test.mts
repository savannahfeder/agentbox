// A NOTE, A FACE AND A "BACK FROM" STAY TRUE ACROSS AN ASK (w-f702d60afe, 2026-11-21).
//
// The same bug hunt on two stage copies: Escape or Back in the ask sheet threw
// the typed note away (the sheet held it and unmounted); after Sam took an ask
// back his row still said "Back from Theo" from an older hand-back; Theo's face
// read TH in the ask list and TO on the chip, because some callers had only
// his first name.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GiveSheet } from '../renderer/src/threads/SharePanel.tsx';
import { handedBackBy } from '../shared/thread-asks.mts';
import { Face, TeamContext, fullName } from '../renderer/src/team/people.tsx';

const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('the note in the ask sheet', () => {
  it('draws the note it is handed, so a reopened sheet has it', () => {
    const html = renderToStaticMarkup(h(GiveSheet, { to: { id: 'theo', name: 'Theo Okafor' }, onGive: () => {}, onAsk: () => {}, note: 'Look at the retry loop', onNote: () => {} }));
    expect(html).toContain('>Look at the retry loop</textarea>');
  });
  it('keeps its own note when nobody keeps it for it', () => {
    const html = renderToStaticMarkup(h(GiveSheet, { to: { id: 'theo', name: 'Theo Okafor' }, onGive: () => {}, onAsk: () => {} }));
    expect(html).toContain('></textarea>');
  });
  it('is kept by the menu per person and cleared only by a send', () => {
    const menu = read('renderer/src/threads/ThreadMenu.tsx');
    expect(menu).toContain("note={notes[givingTo.id] ?? ''}");
    expect(menu.match(/setNotes\(\(was\) => \(\{ \.\.\.was, \[givingTo\.id\]: '' \}\)\)/g)).toHaveLength(2);
    // close() runs on Escape and on Back; it must not wipe the notes.
    const close = menu.slice(menu.indexOf('const close = useCallback'), menu.indexOf('}, []);', menu.indexOf('const close = useCallback')));
    expect(close).not.toContain('setNotes');
  });
});

describe('"Back from" is about the newest ask', () => {
  const back = { status: 'blocked', wrote: { answer: { ts: 100, teammate: 'theo' }, result: { ts: 50 } } };
  it('names who handed it back', () => {
    expect(handedBackBy(back)).toBe('theo');
    expect(handedBackBy(back, 90)).toBe('theo');
  });
  it('is old news once a newer ask went out, taken back or not', () => {
    expect(handedBackBy(back, 120)).toBeNull();
  });
  it('the inbox row passes the newest ask on the thread', () => {
    expect(read('renderer/src/threads/Pages.tsx')).toContain('handedBackBy(item as Parameters<typeof handedBackBy>[0], lastAsk)');
  });
});

describe('a face reads the same from a first name or a full one', () => {
  const team = { byId: new Map([['theo', { id: 'theo', name: 'Theo Okafor', email: '' }], ['sam', { id: 'sam', name: 'Sam Ortiz', email: '' }]]) };
  it('a first name finds the teammate', () => {
    expect(fullName('Theo', team as never)).toBe('Theo Okafor');
  });
  it('leaves a full name, an unknown name and a shared first name alone', () => {
    expect(fullName('Theo Okafor', team as never)).toBe('Theo Okafor');
    expect(fullName('Dana', team as never)).toBe('Dana');
    const two = { byId: new Map([...team.byId, ['t2', { id: 't2', name: 'Theo Park', email: '' }]]) };
    expect(fullName('Theo', two as never)).toBe('Theo');
  });
  it('draws TO for Theo inside a team', () => {
    const html = renderToStaticMarkup(h(TeamContext.Provider, { value: team as never }, h(Face, { name: 'Theo' })));
    expect(html).toContain('>TO</span>');
    expect(renderToStaticMarkup(h(Face, { name: 'Theo' }))).toContain('>TH</span>');
  });
});
