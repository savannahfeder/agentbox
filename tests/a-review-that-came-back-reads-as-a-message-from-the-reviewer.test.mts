// A REVIEW THAT CAME BACK READS AS A MESSAGE FROM THE REVIEWER (2026-11-20).
//
// Lena's "Mock up the pricing page" went to Priya to review and came back with
// one note. All the thread said was a grey strip above its title, "Priya sent
// it back with 1 note: “Love it. Calm a…”", cut off, where nobody looks. It is
// now a message at the foot of the conversation, where the newest thing is
// read: Priya's face, name and time, what she did, and her whole note. The
// strip stays for any other wait that ends. Measured by drawing it.
import { describe, it, expect } from 'vitest';
import React from 'react';
import fs from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReviewCameBack, reviewBack, verdictLine } from '../renderer/src/threads/ReviewCameBack.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';

const h = React.createElement;
const team = { me: 'u-lena', byId: new Map([['u-priya', { id: 'u-priya', name: 'Priya Shah', email: 'priya@team.test' }]]), products: new Map() };
const at = new Date(2026, 10, 20, 4, 51).getTime();
const draw = (comments) => renderToStaticMarkup(h(TeamContext.Provider, { value: team as never }, h(ReviewCameBack, { comments })));

describe('a review that came back', () => {
  it('is signed by the reviewer and says the whole note: the reported case', () => {
    const html = draw([{ by: 'u-priya', ts: at, text: 'Sent back with 1 note: Love it. Calm and clear. Make the Team price say per seat.' }]);
    expect(html).toContain('<span>Priya Shah</span>');
    expect(html).toContain('Sent it back with 1 note');
    expect(html).toContain('Love it. Calm and clear. Make the Team price say per seat.');
    expect(html).not.toContain('…');
  });
  it('says an approval as one', () => {
    expect(verdictLine({ verdict: 'approved', notes: 0 })).toBe('Approved it');
    expect(draw([{ by: 'u-priya', ts: at, text: 'Approved' }])).toContain('Approved it');
  });
  it('takes the newest verdict, and draws nothing for a plain comment', () => {
    expect(reviewBack([{ by: 'u-priya', ts: 1, text: 'Sent back' }, { by: 'u-priya', ts: 2, text: 'Approved' }])?.verdict).toBe('approved');
    expect(draw([{ by: 'u-priya', ts: at, text: 'Looks good to me' }])).toBe('');
    expect(draw(undefined)).toBe('');
  });
});

describe('the thread page', () => {
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  it('draws it after the conversation, and leaves the strip at the top to other waits', () => {
    expect(focus.indexOf('<ReviewCameBack comments={item.waitingComments} />')).toBeGreaterThan(focus.indexOf('<ItemThread'));
    expect(focus).toContain('{!waitNow && waitEndedWords && !reviewBack(item.waitingComments) && (');
  });
});
