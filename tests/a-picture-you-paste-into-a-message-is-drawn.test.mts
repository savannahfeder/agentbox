// A PICTURE YOU PASTE INTO A MESSAGE IS DRAWN, NOT SPELLED OUT.
//
// On 2026-10-05 a screenshot pasted into a reply showed up in the thread as
// its own markdown: the line
//   ![pasted-69703.png](attachments/muw39o3w-vitsyq-pasted-69703.png)
// in plain text where the picture should be. The agent still got the file; only
// the drawing was wrong. It had worked before, and it broke the same afternoon
// (7eba493), when a person's message stopped going through markdown so that a
// pasted `grep ... --include=*.md` kept its stars. That fix was right, but the
// app itself writes every picture you attach into the message as markdown
// (renderer/src/attachments.ts), so it took the pictures with it.
//
// Measured before this fix by rendering Thread with that one message: the body
// was the raw text, `<img` appeared nowhere in it.
//
// The rule now: a person's words are still drawn as typed, but a line the app
// wrote for an attachment, a picture or a file standing on its own line, is
// drawn as the picture or the link it is.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Thread } from '../renderer/src/components/Thread.tsx';
import { typedParts } from '../renderer/src/typed-message.ts';

const md = (text) => createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, text);

const thread = (events) => renderToStaticMarkup(
  createElement(Thread, { events, name: 'Claude', md }),
);

const SHOT = '![pasted-69703.png](attachments/muw39o3w-vitsyq-pasted-69703.png)';
const WORDS = 'I feel like it\'s not fixed. I\'m not sure why it\'s not presenting fixed locally.';

describe('a picture in a message you sent', () => {
  it('is drawn as a picture, the message she sent on 2026-10-05', () => {
    const html = thread([{ at: 1, who: 'you', text: `${WORDS}\n\n${SHOT}` }]);
    expect(html).toMatch(/<img[^>]*src="attachments\/muw39o3w-vitsyq-pasted-69703\.png"/);
    expect(html).not.toContain('![pasted-69703.png]');
    // And the words around it are still exactly the words.
    expect(html).toContain('I feel like it&#x27;s not fixed.');
  });

  it('is drawn when the picture is the whole message', () => {
    const html = thread([{ at: 1, who: 'you', text: SHOT }]);
    expect(html).toMatch(/<img[^>]*src="attachments\/muw39o3w-vitsyq-pasted-69703\.png"/);
    expect(html).not.toContain('![');
  });

  it('draws every one of several pictures pasted together', () => {
    const two = `look\n\n![a.png](attachments/x1-a.png)\n![b.png](attachments/x2-b.png)`;
    const html = thread([{ at: 1, who: 'you', text: two }]);
    expect(html.match(/<img/g)?.length).toBe(2);
    expect(html).not.toContain('![');
  });

  it('is drawn for a teammate as it is for you', () => {
    const html = thread([{ at: 1, who: 'you', by: 'p-maya', text: `see this\n\n${SHOT}` }]);
    expect(html).toMatch(/<img[^>]*src="attachments\/muw39o3w-vitsyq-pasted-69703\.png"/);
  });

  it('draws an attached file as a link to it, not as brackets', () => {
    const html = thread([{ at: 1, who: 'you', text: 'notes attached\n\n[notes.pdf](attachments/x3-notes.pdf)' }]);
    expect(html).toMatch(/<a[^>]*href="attachments\/x3-notes\.pdf"[^>]*>notes\.pdf<\/a>/);
    expect(html).not.toContain('[notes.pdf]');
  });

  it('still draws pictures in what the agent writes', () => {
    const html = thread([{ at: 1, who: 'it', text: `Here it is.\n\n${SHOT}` }]);
    expect(html).toMatch(/<img[^>]*src="attachments\/muw39o3w-vitsyq-pasted-69703\.png"/);
  });
});

describe('what stays exactly as you typed it', () => {
  it('a pasted command keeps its stars, picture or no picture', () => {
    const cmd = 'grep -r foo . --include=*.md --include=*.json';
    const html = thread([{ at: 1, who: 'you', text: `${cmd}\n\n${SHOT}` }]);
    expect(html).toContain(cmd);
    expect(html).not.toMatch(/<em>/);
    expect(html).toMatch(/<img/);
  });

  it('picture syntax quoted inside a sentence is words, not a picture', () => {
    const text = 'the line `![x](attachments/y.png)` showed instead of the picture';
    const html = thread([{ at: 1, who: 'you', text }]);
    expect(html).not.toMatch(/<img/);
    expect(html).toContain(text);
  });

  it('a link you typed yourself, on its own line, is left as typed', () => {
    const text = 'the docs:\n[guide](https://example.com/guide)';
    const html = thread([{ at: 1, who: 'you', text }]);
    expect(html).not.toMatch(/<a /);
    expect(html).toContain('[guide](https://example.com/guide)');
  });

  it('a message with no attachment is one piece of text, untouched', () => {
    expect(typedParts('one\ntwo\n\nthree')).toEqual([{ text: 'one\ntwo\n\nthree' }]);
  });
});

describe('where the words end and a picture begins', () => {
  it('takes the blank line before a picture off the words, since the picture starts its own line', () => {
    expect(typedParts(`hello\n\n${SHOT}`)).toEqual([{ text: 'hello' }, { embed: SHOT }]);
  });

  it('keeps words that come after a picture', () => {
    expect(typedParts(`${SHOT}\nand this`)).toEqual([{ embed: SHOT }, { text: 'and this' }]);
  });

  it('a line with an attached picture and words on it draws the picture beside the words', () => {
    expect(typedParts(`see ${SHOT}`)).toEqual([{ text: 'see' }, { embed: SHOT }]);
  });
});
