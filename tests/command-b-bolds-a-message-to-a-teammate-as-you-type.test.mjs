// ⌘B BOLDS A MESSAGE TO A TEAMMATE AS YOU TYPE IT (w-0d55a2b160).
//
// What broke, in the person's words: "When I hit Command-B, Command-I, or
// anything else that I would think would change the font, allow me to adjust
// it. It's not happening. ... if I paste rich text formatting in here, it
// doesn't format. It just shows, let's say, `**`."
//
// Measured before the fix: the chat's reply box was a <textarea>
// (Focus.tsx, `className="dock-input"`), its key handler had no case for ⌘B or
// ⌘I at all, and the formatting bar wrote `**bold text**` into it as characters.
// A textarea cannot draw bold, so every format showed as its marks.
//
// The box is now the app's own rich editor (team/chat-editor.ts,
// team/RichReply.tsx). What is held here is everything about it that has no
// DOM: the markdown a message goes out as, what each key does to the document,
// where a character sits for the @ menu, and which pasted plain text is read as
// markdown and which is left exactly as it was.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import {
  chatSchema, chatDoc, chatMarkdown, formatCommand, CHAT_KEYS,
  plainOf, plainAt, posAt, spliceOf, readsAsMarkdown,
} from '../renderer/src/team/chat-editor.ts';

const schema = chatSchema();
const docOf = (md) => schema.nodeFromJSON(chatDoc(md, schema));
const stateOf = (md, from, to = from) => {
  const doc = docOf(md);
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, from, to) });
};
const run = (state, what) => {
  let next = state;
  formatCommand(what, schema)(state, (tr) => { next = state.apply(tr); });
  return chatMarkdown(next.doc.toJSON());
};
const src = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

describe('the markdown a message goes out as', () => {
  it('comes back the same for every shape a message has', () => {
    for (const md of [
      'hello',
      '**bold** and *italic* and ~~gone~~ and `code`',
      'one\ntwo',
      'one\n\nthree',
      '- one\n- two',
      '1. one\n2. two',
      '> a quote',
      'see [the doc](https://example.com/x)',
      '@Codex in agentbox, look at this',
    ]) expect(chatMarkdown(chatDoc(md, schema)), md).toBe(md);
  });

  // RETURN IS A NEW LINE, the way it was in the text field. Two paragraphs in
  // the box go out one newline apart, and an empty one between them is the
  // blank line it looks like.
  it('sends two lines as two lines, not as two paragraphs', () => {
    const doc = { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
    ] };
    expect(chatMarkdown(doc)).toBe('one\ntwo');
    doc.content.splice(1, 0, { type: 'paragraph' });
    expect(chatMarkdown(doc)).toBe('one\n\ntwo');
  });

  it('keeps the space at the end, which is what a typed-through /command waits for', () => {
    expect(chatMarkdown(chatDoc('/auto ', schema))).toBe('/auto ');
  });

  it('takes an old draft with a heading or a picture in as its words, not as nothing', () => {
    expect(chatMarkdown(chatDoc('## Plan\nship it', schema))).toMatch(/Plan[\s\S]*ship it/);
    expect(chatMarkdown(chatDoc('![shot](attachments/a.png)', schema))).toContain('attachments/a.png');
  });

  it('is empty for an empty box', () => {
    expect(chatMarkdown(chatDoc('', schema))).toBe('');
  });
});

describe('the keys', () => {
  it('are Slack’s: ⌘B, ⌘I, ⌘⇧X, ⌘⇧C and ⌘⇧7, 8, 9', () => {
    expect(CHAT_KEYS).toEqual({
      'Mod-b': 'bold', 'Mod-i': 'italic', 'Mod-Shift-x': 'strike', 'Mod-Shift-c': 'code',
      'Mod-Shift-7': 'number', 'Mod-Shift-8': 'bullet', 'Mod-Shift-9': 'quote',
    });
  });

  it('bold the selected word, and only that word', () => {
    // "one two": the doc's text starts at 1, so "two" is 5..8.
    expect(run(stateOf('one two', 5, 8), 'bold')).toBe('one **two**');
    expect(run(stateOf('one two', 5, 8), 'italic')).toBe('one *two*');
    expect(run(stateOf('one two', 5, 8), 'strike')).toBe('one ~~two~~');
    expect(run(stateOf('one two', 5, 8), 'code')).toBe('one `two`');
  });

  it('take it off again when pressed on bold text', () => {
    expect(run(stateOf('one **two**', 5, 8), 'bold')).toBe('one two');
  });

  it('turn a line into a list or a quote, and back', () => {
    expect(run(stateOf('item', 2), 'bullet')).toBe('- item');
    expect(run(stateOf('item', 2), 'number')).toBe('1. item');
    expect(run(stateOf('item', 2), 'quote')).toBe('> item');
    // Inside the list now: doc > bulletList > listItem > paragraph, so the
    // text starts at 3.
    expect(run(stateOf('- item', 4), 'bullet')).toBe('item');
    expect(run(stateOf('> item', 3), 'quote')).toBe('item');
  });

  it('are wired into the box and read by the bar, so the two cannot disagree', () => {
    const box = src('renderer/src/team/RichReply.tsx');
    expect(box).toMatch(/chatExtensions\(/);
    const bar = src('renderer/src/team/FormatBar.tsx');
    expect(bar).toMatch(/rich/);
  });
});

describe('where a character sits, for the @ menu', () => {
  it('counts the words, not the marks', () => {
    const doc = docOf('say **hi** @Co');
    expect(plainOf(doc)).toBe('say hi @Co');
    const end = doc.content.size - 1;
    expect(plainAt(doc, end)).toBe('say hi @Co'.length);
    expect(posAt(doc, 'say hi @Co'.length)).toBe(end);
  });

  it('counts a new line as one character, and goes back and forth the same', () => {
    const doc = docOf('one\ntwo');
    expect(plainOf(doc)).toBe('one\ntwo');
    for (let at = 0; at <= 7; at += 1) expect(plainAt(doc, posAt(doc, at))).toBe(at);
  });

  it('counts across paragraphs and list items', () => {
    const doc = schema.nodeFromJSON({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'ab' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cd' }] }] }] },
    ] });
    expect(plainOf(doc)).toBe('ab\ncd');
    for (let at = 0; at <= 5; at += 1) expect(plainAt(doc, posAt(doc, at))).toBe(at);
    expect(doc.textBetween(posAt(doc, 3), posAt(doc, 5))).toBe('cd');
  });

  it('finds the one edit between two versions of the words', () => {
    expect(spliceOf('hi @Co there', 'hi @Codex in x there')).toEqual({ from: 6, to: 6, insert: 'dex in x' });
    expect(spliceOf('abc', 'abc')).toEqual({ from: 3, to: 3, insert: '' });
    expect(spliceOf('a @x b', 'a b')).toEqual({ from: 2, to: 5, insert: '' });
  });
});

describe('pasted plain text', () => {
  it('is read as markdown when it carries marks that cannot be anything else', () => {
    expect(readsAsMarkdown('This is **important** to me')).toBe(true);
    expect(readsAsMarkdown('see [the doc](https://example.com)')).toBe(true);
    expect(readsAsMarkdown('- one\n- two')).toBe(true);
    expect(readsAsMarkdown('> quoted')).toBe(true);
  });

  // THE CASE THAT MUST NOT MATCH: the pasted command that started the
  // as-typed rule (tests/your-own-words-show-as-you-typed-them.test.mjs).
  it('is left alone when it is a command, a sum or a name', () => {
    expect(readsAsMarkdown('grep -r foo . --include=*.md --include=*.json')).toBe(false);
    expect(readsAsMarkdown('2 * 3 * 4')).toBe(false);
    expect(readsAsMarkdown('rename user_id_v2')).toBe(false);
    expect(readsAsMarkdown('ls src/**/*.ts')).toBe(false);
    expect(readsAsMarkdown('- just one dash')).toBe(false);
  });
});
