// TICKED THREADS SAY WHAT YOU CAN DO WITH THEM (w-8b637c7802).
//
// In every round, synthetic testers ticked threads and saw boxes ticked and
// titles underlined, nothing else; one pressed E "on a hunch". The row hints go
// blank while threads are ticked. Picked by the person from five drawings
// (option 1): the app's own toast, held while threads are ticked, reading
// "3 selected · E Done · L Later · esc Clear". Measured by drawing the bar.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tickedKeys } from '../renderer/src/ticked-keys.ts';
import { TickedBar } from '../renderer/src/components/TickedBar.tsx';

const draw = (props) => renderToStaticMarkup(React.createElement(TickedBar, { count: 3, view: 'inbox', onKey() {}, ...props }));

describe('the keys it offers', () => {
  it('in Needs you and In progress: Done, Later, Clear', () => {
    for (const view of ['inbox', 'progress']) {
      expect(tickedKeys(view).map((k) => `${k.key} ${k.word}`)).toEqual(['E Done', 'L Later', 'esc Clear']);
    }
  });
  it('in Later, E brings them back, as its row hint says', () => {
    expect(tickedKeys('snoozed').map((k) => `${k.key} ${k.word}`)).toEqual(['E Back to inbox', 'L Later', 'esc Clear']);
  });
  it('in Done, only Clear, since a closed thread cannot be closed or put off', () => {
    expect(tickedKeys('done').map((k) => k.key)).toEqual(['esc']);
  });
});

describe('the bar', () => {
  it('is the app’s toast, with the count and the keys', () => {
    const html = draw();
    expect(html).toMatch(/class="toast toast-plain toast-ticked"/);
    expect(html).toMatch(/<span class="toast-line">3 selected<\/span>/);
    expect(html).toMatch(/<kbd>E<\/kbd><span class="toast-key-word">Done<\/span>/);
    expect(html).toMatch(/<kbd>L<\/kbd><span class="toast-key-word">Later<\/span>/);
    expect(html).toMatch(/<kbd>esc<\/kbd><span class="toast-key-word">Clear<\/span>/);
  });
  it('says one selected for one', () => {
    expect(draw({ count: 1 })).toMatch(/>1 selected</);
  });
  it('is drawn while threads are ticked, on the list, when no other toast is up', () => {
    const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');
    expect(app).toMatch(/multiSel\.size > 0 && !toast && !focused && !modal && [^(]*\(\s*<TickedBar/);
  });
});
