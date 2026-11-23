// YOUR OWN HAND-BACK IS SIGNED "YOU" ON THE THREAD YOU HELPED ON.
//
// In a power test Sam helped on Lena's thread, wrote a note and pressed Hand
// back to Lena, then logged that his note had disappeared. His picture shows
// it there, under "Sam" with his face, while his message to her agent just
// above it read "You". A helper's words are drawn with the helper's name, and
// nothing asked whether the helper was the person reading, so he looked for
// "You" and did not find it. Measured by drawing the thread as Sam reads it.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Thread } from '../renderer/src/components/Thread.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';

const NOW = new Date(2026, 10, 23, 18, 30).getTime();
const at = (m: number) => new Date(2026, 10, 23, 18, m).getTime();
const SAM = 'p-sam', LENA = 'p-lena', DEV = 'p-dev';

const teamAs = (me: string) => ({
  state: {}, me,
  byId: new Map([
    [SAM, { id: SAM, name: 'Sam Ortiz', email: '', avatarUrl: null }],
    [LENA, { id: LENA, name: 'Lena Fischer', email: '', avatarUrl: null }],
    [DEV, { id: DEV, name: 'Dev Rao', email: '', avatarUrl: null }],
  ]),
  products: new Map(),
});
const handBack = (from: string) => ({ at: at(21), who: 'it', fromId: from, text: 'You handed this back.\n\nI picked Book appointment to match the heading.' });
const asked = { at: at(1), who: 'it', text: 'Which label should the button use?' };

const draw = (me: string, events: object[]) => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
  try {
    return renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: teamAs(me) as never },
      React.createElement(Thread, { events, name: "Lena's agent", landOn: 'w-1', onWhole: () => {}, md: (t: string) => React.createElement('p', null, t) } as never)));
  } finally { clock.mockRestore(); }
};
// The name, without the face's initials beside it.
const names = (html: string) => [...html.matchAll(/class="msg-who">(?:<span class="tm-av"[^>]*>[^<]*<\/span>)?([^<]*)<\/span>/g)].map((m) => m[1].replace(/&#x27;/g, "'"));

describe('a hand-back on the thread you helped on', () => {
  it('is signed You when you wrote it', () => {
    expect(names(draw(SAM, [asked, handBack(SAM)]))).toEqual(["Lena's agent", 'You']);
  });
  // A second "You" in plain weight under a bold one read as somebody else's.
  it('is drawn as yours, like your other messages, only when you wrote it', () => {
    expect(draw(SAM, [asked, handBack(SAM)])).toMatch(/class="msg yours /);
    expect(draw(LENA, [asked, handBack(SAM)])).not.toMatch(/class="msg yours /);
  });
  it('is signed with the helper’s name when somebody else wrote it', () => {
    expect(names(draw(LENA, [asked, handBack(SAM)]))).toEqual(["Lena's agent", 'Sam']);
    expect(names(draw(SAM, [asked, handBack(DEV)]))).toEqual(["Lena's agent", 'Dev']);
  });
});
