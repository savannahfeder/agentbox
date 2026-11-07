// YOUR OWN WORDS SHOW IN THE THREAD EXACTLY AS YOU TYPED THEM.
//
// A tester pasted `grep -r foo . --include=*.md --include=*.json` into a
// thread. The composer showed it right; the thread swallowed both stars and
// italicised everything between them, and the summary panel cut the line at
// the bare ` . ` in the middle of the command. The agent had the whole text,
// so only the drawing was wrong.
//
// Measured before the fix by rendering Thread with that one message:
//   <div class="msg-body"><p>grep -r foo . --include=<em>.md --include=</em>.json</p></div>
// and firstSentence of the same string returned 'grep -r foo .' — three stars
// deleted and the command cut after its first word-and-a-half.
//
// Two rules come out of it, one per half:
//   a person's message is shown as typed, never through markdown;
//   firstSentence strips only PAIRED emphasis, and ends a sentence only where
//   a sentence really ends.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Thread } from '../renderer/src/components/Thread.tsx';
import { firstSentence, summaryOf } from '../shared/thread-cards.mjs';

const COMMAND = 'grep -r foo . --include=*.md --include=*.json';

// The thread is handed its markdown renderer from above (Focus owns the
// plugins); this is the same pair of plugins, which is all these tests need.
const md = (text) => createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, text);

const thread = (events) => renderToStaticMarkup(
  createElement(Thread, { events, name: 'Claude', md }),
);

const bodyOf = (html) => {
  const at = html.indexOf('class="msg-body');
  return html.slice(html.indexOf('>', at) + 1, html.indexOf('</div>', at));
};

describe('a message a person typed', () => {
  it('keeps the stars in a pasted command', () => {
    const body = bodyOf(thread([{ at: 1, who: 'you', text: COMMAND }]));
    expect(body).toBe(COMMAND);
    expect(body).not.toMatch(/<em>/);
  });

  it('keeps its line breaks, because a message typed on three lines was typed on three lines', () => {
    const body = bodyOf(thread([{ at: 1, who: 'you', text: 'one\ntwo\n\nthree' }]));
    expect(body).toBe('one\ntwo\n\nthree');
    // Nothing draws those breaks without the rule that honours them.
    const css = readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
    const rule = css.slice(css.indexOf('.msg-body.typed {'), css.indexOf('}', css.indexOf('.msg-body.typed {')));
    expect(rule).toMatch(/white-space:\s*pre-wrap/);
    // And a pasted command longer than the column wraps rather than running off it.
    expect(rule).toMatch(/overflow-wrap:\s*(anywhere|break-word)/);
  });

  it('is as plain for a teammate as it is for you', () => {
    const body = bodyOf(thread([{ at: 1, who: 'you', by: 'p-maya', text: 'try *.json too' }]));
    expect(body).toBe('try *.json too');
  });

  it('does not escape its way out: the text is the text, angle brackets and all', () => {
    const body = bodyOf(thread([{ at: 1, who: 'you', text: 'a < b && c > d' }]));
    // React escapes for HTML, so read it back the way a browser would.
    expect(body.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).toBe('a < b && c > d');
  });
});

describe('a message the agent wrote', () => {
  it('is still markdown, so *x* is still italics', () => {
    const body = bodyOf(thread([{ at: 1, who: 'it', text: 'that is *important*' }]));
    expect(body).toBe('<p>that is <em>important</em></p>');
  });

  it('still draws a list as a list', () => {
    const body = bodyOf(thread([{ at: 1, who: 'it', text: '- one\n- two' }]));
    expect(body).toMatch(/<ul>[\s\S]*<li>one<\/li>/);
  });
});

describe('the sentence the summary panel shows', () => {
  it('leaves a lone star alone and does not stop at a bare full stop', () => {
    expect(firstSentence(COMMAND)).toBe(COMMAND);
  });

  it('still takes only the first sentence of a real two-sentence body', () => {
    expect(firstSentence('Pull Acme’s usage. Then draft terms.')).toBe('Pull Acme’s usage.');
    expect(summaryOf({ title: 't', body: 'Pull Acme’s usage. Then draft terms.' }).problem)
      .toBe('Pull Acme’s usage.');
  });

  it('still strips the emphasis that really is emphasis', () => {
    // The case that was already guarded, 2026-10-01.
    expect(firstSentence('## Heading\n**Bold ask?** More.')).toBe('Bold ask?');
    expect(firstSentence('*Nearly* done. Next week.')).toBe('Nearly done.');
    expect(firstSentence('Run `npm run ship`. Then tell me.')).toBe('Run npm run ship.');
  });

  it('keeps an underscore that is part of a name', () => {
    expect(firstSentence('Rename user_id_v2 before Friday.')).toBe('Rename user_id_v2 before Friday.');
    expect(firstSentence('_Nearly_ done. Next week.')).toBe('Nearly done.');
  });

  it('does not end a sentence in the middle of a number or a file name', () => {
    expect(firstSentence('It costs $96,400.50 today. Tomorrow who knows.')).toBe('It costs $96,400.50 today.');
    expect(firstSentence('Open shared/thread-cards.mjs and read it.')).toBe('Open shared/thread-cards.mjs and read it.');
  });

  it('ends a sentence only where a capital or the end follows', () => {
    expect(firstSentence('Fix the login. it broke yesterday.')).toBe('Fix the login. it broke yesterday.');
    expect(firstSentence('Fix the login.')).toBe('Fix the login.');
  });

  it('is still cut to its length when one sentence runs long', () => {
    const long = `${'word '.repeat(80)}end.`;
    expect(firstSentence(long).length).toBeLessThanOrEqual(240);
    expect(firstSentence(long).endsWith('…')).toBe(true);
  });
});
