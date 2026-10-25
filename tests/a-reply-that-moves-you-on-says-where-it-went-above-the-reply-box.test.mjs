// A REPLY THAT MOVES YOU ON SAYS WHERE IT WENT, ABOVE THE REPLY BOX (w-4465054f04).
//
// In the cloud power test the testers logged "the screen jumps to another
// thread after I reply" 74 times, and several logged their reply as lost. None
// was: a reply from inside a thread opened from Needs you opens the next one
// waiting, and the only sign was a card in the bottom-right corner, far from
// the reply box, naming the project ("Sent → Sandbox"), gone in six seconds.
// Photographed on a copy: half a second after sending, the whole screen was
// the next thread; at eight seconds nothing said where the reply went. On the
// phone the same note sat under the top bar, over what she was reading.
//
// Picked from six drawings: one line right above the reply box, "Sent to"
// and the thread's name, O for Back and Z for Undo, staying until she leaves
// that thread. On the phone too, above the input.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { saysWhereItWent } from '../renderer/src/toast-parts.ts';
import { SentLine } from '../renderer/src/components/SentLine.tsx';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const focus = read('renderer/src/components/Focus.tsx');
const phone = read('renderer/src/phone.css');

const NOTES = { product: 'p', id: 'w-notes' };
const PAGINATION = { product: 'p', id: 'w-pages' };
const sent = (goes = NOTES) => ({ text: 'Sent → Sandbox · press Z to undo', goes: { ...goes, sent: true } });

describe('when the line is drawn', () => {
  it('after a send that moved you to another thread', () => {
    expect(saysWhereItWent(sent(), PAGINATION)).toBe(true);
  });

  it('not when the send kept you on the thread it went to, where your words already show', () => {
    expect(saysWhereItWent(sent(), NOTES)).toBe(false);
  });

  it('not when no thread is open, where there is no reply box to stand on', () => {
    expect(saysWhereItWent(sent(), null)).toBe(false);
  });

  it('not for a note that was not a send: a close, a new thread, a repeating task', () => {
    expect(saysWhereItWent({ text: 'Closed: x · press Z to undo' }, PAGINATION)).toBe(false);
    expect(saysWhereItWent({ text: 'Started in Sandbox · Z to undo', goes: NOTES }, PAGINATION)).toBe(false);
    expect(saysWhereItWent({ text: 'Repeating → Sandbox', goes: { ...NOTES, repeat: true, sent: true } }, PAGINATION)).toBe(false);
    expect(saysWhereItWent(null, PAGINATION)).toBe(false);
  });
});

describe('what the line says', () => {
  const draw = (props) => renderToStaticMarkup(React.createElement(SentLine, { title: 'Write the release notes for 0.1.16', undoes: true, onBack: () => {}, onUndo: () => {}, ...props }));

  it('where it went by the thread\'s name, with O for Back and Z for Undo', () => {
    const html = draw();
    expect(html).toContain('Sent to');
    expect(html).toContain('Write the release notes for 0.1.16');
    expect(html).toMatch(/<kbd>O<\/kbd>[^]*Back/);
    expect(html).toMatch(/<kbd>Z<\/kbd>[^]*Undo/);
  });

  it('nothing about where you are now, which the screen already shows', () => {
    expect(draw()).not.toMatch(/next one|waiting/i);
  });

  it('no Z when there is nothing to undo', () => {
    expect(draw({ undoes: false })).not.toMatch(/<kbd>Z<\/kbd>/);
  });
});

describe('where it is drawn', () => {
  it('a send through the one answering path is marked as a send', () => {
    expect(app).toContain('showToast(`${toast} · press Z to undo`, goes && { ...goes, sent: true });');
  });

  it('above the reply box, in the thread view, and the corner card is not drawn as well', () => {
    expect(app).toMatch(/aboveDock=\{whereItWent\}/);
    // On a Needs you thread it goes up into the bar instead (w-65bcefb857).
    expect(focus).toMatch(/\{!sentUp && aboveDock\}\s*<div className="dock-card">/);
    expect(app).toMatch(/if \(sentLineShown\) return null;/);
  });

  it('nowhere for the moment between leaving a thread and opening the next', () => {
    expect(app).toMatch(/advanceRef\.current && !focused/);
  });

  it('on its own clock rather than the six-second one, and gone when you leave the thread', () => {
    expect(app).toMatch(/clearTimeout\(toastTimer\.current\)/);
    expect(app).toMatch(/lineOn\.current/);
  });

  it('on the phone, in the reply box\'s flow above the input, not over the page', () => {
    const rule = phone.slice(phone.indexOf('.sent-line'));
    expect(phone).toContain('.sent-line');
    expect(rule.slice(0, rule.indexOf('}'))).not.toMatch(/position:\s*fixed/);
    expect(phone).toMatch(/\.sent-line kbd \{ display: none; \}/);
  });
});
