// THE ASKED CHIP CAN MESSAGE THE PERSON (w-f702d60afe, 2026-11-21).
//
// A review of the hand-off flow: following up on something you asked about,
// the "Theo is reviewing" chip offered only Take it back. Nudging Theo is a
// message about the thread, as the thread page's Message Sam already sends.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AsksChip } from '../renderer/src/team/AsksLine.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

describe("the chip over a thread you asked someone about", () => {
  it('names the message it sends in its popover code, and the app opens the conversation about the thread', () => {
    const chip = fs.readFileSync(new URL('../renderer/src/team/AsksLine.tsx', import.meta.url), 'utf8');
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(chip).toContain('{onMessage && <button type="button" className="asks-take" onClick={() => { setOpen(false); onMessage(a.to); }}>Message {first}</button>}');
    expect(app).toContain('onMessage={(personId) => messageAbout(personId, rowTitle(focused))}');
    expect(app).toContain("const about = title ? `About “${title}”: ` : '';");
  });
  it('still draws closed as the chip alone', () => {
    const people = [{ id: 'sam', name: 'Sam Ortiz' }, { id: 'theo', name: 'Theo Okafor' }];
    const ask = { id: 't1', product: 'dm', labels: ['given-task'], status: 'open', assignee: 'theo', createdBy: 'sam', createdAt: 100, ask: { kind: 'review', owner: 'sam', thread: 'w-1', product: 'api' }, wrote: { ask: { by: 'sam', ts: 100 } } };
    const html = renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: { me: 'sam', byId: new Map(people.map((p) => [p.id, p])), products: new Map(), state: { seen: {} } } as never },
      React.createElement(AsksChip, { item: { id: 'w-1', product: 'api' } as never, items: [ask] as never, onTakeBack() {}, onMessage() {} })));
    expect(html).not.toContain('Message Theo');
    expect(html).toContain('Asked Theo for a review');
  });
});
