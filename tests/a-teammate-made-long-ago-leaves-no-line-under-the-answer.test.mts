// A TEAMMATE MADE LONG AGO LEAVES NO LINE UNDER THE ANSWER (w-ccdf2be7ee).
//
// "You made a Collaboration tester for work like this." sat at the foot of a
// thread long after the teammate was made, on every visit, and also on the
// other threads the same answer was copied to, where nobody had pressed Make.
// TeammateOffer drew it whenever the stored offer said `answered: 'made'`.
// Now it is the reply to the press, seen only in the visit the press was made.
// No jsdom here, so the press is read from the source.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { TeammateOffer } = await import('../renderer/src/components/TeammateOffer.tsx');
const source = fs.readFileSync(new URL('../renderer/src/components/TeammateOffer.tsx', import.meta.url), 'utf8');

const row = (offer: Record<string, unknown> | undefined) => ({
  id: 'w-test', product: 'site', title: 'Test the handoff', status: 'open', labels: ['founder'],
  routed: { to: 'agent', why: 'x', at: 1, by: 'auto', ...(offer ? { offer } : {}) },
});

describe('the line saying you made a teammate', () => {
  it('is gone when you come back to a thread whose teammate was made earlier', () => {
    expect(renderToStaticMarkup(h(TeammateOffer, { item: row({ role: 'Collaboration tester', why: '', answered: 'made' }) }))).toBe('');
  });

  it('is shown only for a press of Make in this visit', () => {
    expect(source).toMatch(/if \(pressed === 'made'\) return <p className="to-made">/);
  });

  it('leaves an unanswered offer as the card', () => {
    expect(renderToStaticMarkup(h(TeammateOffer, { item: row({ role: 'Collaboration tester', why: 'It repeats.' }) }))).toContain('to-card');
  });

  it('leaves a turned-down offer drawing nothing', () => {
    expect(renderToStaticMarkup(h(TeammateOffer, { item: row({ role: 'Collaboration tester', why: '', answered: 'no' }) }))).toBe('');
  });
});
