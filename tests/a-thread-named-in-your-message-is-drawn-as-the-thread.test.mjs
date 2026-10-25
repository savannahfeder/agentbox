// A THREAD NAMED IN YOUR MESSAGE IS DRAWN AS THAT THREAD (w-c110f2371d).
//
// A thread picked with # is sent as `[Its name](w-…)`. Your own words are
// drawn as typed, never as markdown, so in the first build that link showed up
// in the thread as its brackets and its id (seen in the built renderer, the
// picture of a sent reply). The app wrote that link, like an attached picture,
// so it is lifted out and drawn as the thread; a link you typed yourself, to
// anywhere else, stays words. The phone shows the thread's name.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Thread } from '../renderer/src/components/Thread.tsx';
import { TicketNavigation } from '../renderer/src/components/TicketReference.tsx';
import { threadPieces } from '../renderer/src/typed-message.ts';
import { typedWords } from '../mobile/src/lib/files';

const holo = 'w-2a1681c0b3';
const sent = `Use what we learned in [Holo effect: CSS or WebGL?](${holo}) and keep the frame rate up.`;
const names = { [holo]: 'Holo effect: CSS or WebGL?' };

const draw = (text) => renderToStaticMarkup(createElement(TicketNavigation.Provider, { value: { open: () => {}, name: (id) => names[id] ?? null } },
  createElement(Thread, { events: [{ at: 1, who: 'you', text }], name: 'Claude', md: (t) => t })));
const body = (html) => html.slice(html.indexOf('msg-body typed'), html.lastIndexOf('</div>'));

describe('a thread link in your own words', () => {
  it('is drawn as the thread, with the words around it as typed', () => {
    const html = body(draw(sent));
    expect(html).toContain('mention-thread');
    expect(html).toContain('Holo effect: CSS or WebGL?');
    expect(html).not.toContain(`](${holo})`);
    expect(html).toContain('Use what we learned in ');
    expect(html).toContain(' and keep the frame rate up.');
  });
  it('is split out of the words without touching them', () => {
    expect(threadPieces(sent)).toEqual([
      { text: 'Use what we learned in ' },
      { thread: holo, text: 'Holo effect: CSS or WebGL?' },
      { text: ' and keep the frame rate up.' },
    ]);
    expect(threadPieces('[Ship \\[beta\\] build](w-0123456789)')).toEqual([{ thread: 'w-0123456789', text: 'Ship [beta] build' }]);
  });
  it.each([
    ['a link you typed to a page', 'see [the docs](https://example.com)'],
    ['an id that is not a thread', '[x](w-123)'],
    ['a bare id', `as in ${holo}`],
    ['no link at all', 'grep -r foo . --include=*.md'],
  ])('leaves %s as typed', (_, text) => {
    expect(threadPieces(text)).toEqual([{ text }]);
  });
  it('reads as the thread name on the phone', () => {
    expect(typedWords(sent)).toBe('Use what we learned in Holo effect: CSS or WebGL? and keep the frame rate up.');
  });
});
