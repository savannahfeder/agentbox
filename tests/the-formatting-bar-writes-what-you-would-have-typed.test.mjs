// THE FORMATTING BAR UNDER THE REPLY BOX IN A CHAT, AND WHERE IT LEAVES THE
// CARET.
//
// Drawing A of the messages redesign (w-2e8aa16f0f) puts a bar under the reply
// box: bold, italic, strike, link, lists, quote, code, then @, attach, emoji.
// A message is markdown and the thread renders it, so each button writes the
// characters somebody would otherwise have typed.
//
// WHAT IS MEASURED HERE IS THE CARET, because that is the half with no symptom.
// A bold button that wraps the right text and leaves the caret outside the
// asterisks makes the next word bold-and-then-not, and the only way to find
// that is to type the second word. So every case below checks the selection it
// leaves as well as the text it writes.
import { describe, it, expect } from 'vitest';
import { applyFormat, insertAt } from '../renderer/src/team/compose-format.ts';
import { quoteOf, withQuote } from '../renderer/src/team/chat-quote.ts';

const run = (text, from, to, what) => applyFormat(text, from, to, what);
// The text with the selection marked, so a case reads as what you would see.
const shown = ({ text, from, to }) => `${text.slice(0, from)}[${text.slice(from, to)}]${text.slice(to)}`;

describe('wrapping what is selected', () => {
  it('bolds a selected word and keeps it selected inside the marks', () => {
    expect(shown(run('one two', 4, 7, 'bold'))).toBe('one **[two]**');
  });

  it('does italic, strike and code the same way', () => {
    expect(shown(run('two', 0, 3, 'italic'))).toBe('*[two]*');
    expect(shown(run('two', 0, 3, 'strike'))).toBe('~~[two]~~');
    expect(shown(run('two', 0, 3, 'code'))).toBe('`[two]`');
  });

  it('leaves words to type over when nothing is selected', () => {
    expect(shown(run('', 0, 0, 'bold'))).toBe('**[bold text]**');
  });

  // THE BOUNDARY EITHER SIDE: pressing bold on text that is already bold takes
  // it off, whether the marks are inside what is selected or just outside it.
  it('unbolds when the marks are inside the selection', () => {
    expect(shown(run('a **two**', 2, 9, 'bold'))).toBe('a [two]');
  });

  it('unbolds when the selection is the words between the marks', () => {
    expect(shown(run('a **two**', 4, 7, 'bold'))).toBe('a [two]');
  });

  // AND THE CASE THAT MUST NOT UNWRAP: one asterisk either side is italic, and
  // bold must not mistake it for its own marks.
  it('bolds italic text rather than unwrapping it', () => {
    expect(shown(run('*two*', 0, 5, 'bold'))).toBe('**[*two*]**');
  });
});

describe('a link', () => {
  it('puts the words in the brackets and the caret where the address goes', () => {
    expect(shown(run('see this', 4, 8, 'link'))).toBe('see [this]([])');
  });

  it('still leaves somewhere to type with nothing selected', () => {
    expect(shown(run('', 0, 0, 'link'))).toBe('[text]([])');
  });
});

describe('the formats that lead a line', () => {
  it('bullets every line a selection touches, whole lines either end', () => {
    expect(run('one\ntwo', 1, 5, 'bullet').text).toBe('- one\n- two');
  });

  it('numbers them in order', () => {
    expect(run('one\ntwo\nthree', 0, 13, 'number').text).toBe('1. one\n2. two\n3. three');
  });

  it('quotes a line the caret is merely sitting in', () => {
    expect(run('one\ntwo', 5, 5, 'quote').text).toBe('one\n> two');
  });

  it('takes the lead off again when every line already has it', () => {
    expect(run('- one\n- two', 0, 11, 'bullet').text).toBe('one\ntwo');
  });

  // The case that must NOT come off: a half-marked block is finished, not undone.
  it('leads the lines that are missing it rather than stripping the ones that have it', () => {
    expect(run('- one\ntwo', 0, 9, 'bullet').text).toBe('- - one\n- two');
  });
});

describe('@ and an emoji', () => {
  it('drops in at the caret and leaves the caret after it', () => {
    expect(shown(insertAt('hi ', 3, 3, '@'))).toBe('hi @[]');
    expect(shown(insertAt('hi', 2, 2, '👍'))).toBe('hi👍[]');
  });

  it('replaces a selection the way typing would', () => {
    expect(shown(insertAt('hi you', 3, 6, '@'))).toBe('hi @[]');
  });
});

describe('Reply quotes the message you pressed it on', () => {
  it('marks every line it keeps', () => {
    expect(quoteOf('one\ntwo')).toBe('> one\n> two');
  });

  it('says how much it left rather than cutting in silence', () => {
    expect(quoteOf('a\nb\nc\nd\ne')).toBe('> a\n> b\n> c\n> …2 more lines');
  });

  it('puts the quote above what is already typed, with room between', () => {
    expect(withQuote('my answer', 'one')).toBe('> one\n\nmy answer');
  });

  it('adds nothing on a second press of the same message', () => {
    const once = withQuote('', 'one');
    expect(withQuote(once, 'one')).toBe(once);
  });

  it('leaves the box alone when there is nothing to quote', () => {
    expect(withQuote('typed', '   ')).toBe('typed');
  });
});
