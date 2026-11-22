// SHIFT+RETURN IN A CHAT'S LIST STARTS THE NEXT POINT (w-f689c07680, 2026-11-21).
//
// The founder asked for the chat box to hold up "where you have formatting".
// Return sends a chat message, so Shift+Return is the only new line, and it
// broke the line inside the block it was in. In a bulleted list three points
// typed as three lines came out as one bullet holding three lines. In a code
// block it left the block, so code could only ever be one line. And a synthetic
// tester wrote a bold heading, Shift+Return, then pressed the list button: the
// heading became a bullet too, because both lines were one paragraph, and the
// sent message ran the first point onto the heading.
//
// Now it is Slack's: every line is a block of its own, so the list button
// lists the line it is on. In a list Shift+Return starts the next point, in a
// quote the next line of the quote, and on an empty one it ends the list or the
// quote. In a code block it is a new line of code.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { chatSchema, chatDoc, chatMarkdown, formatCommand, shiftReturn } from '../renderer/src/team/chat-editor.ts';

const schema = chatSchema();
const at = (md: string, where: (doc: ReturnType<typeof schema.nodeFromJSON>) => number) => {
  const doc = schema.nodeFromJSON(chatDoc(md, schema));
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, where(doc)) });
};
const end = (doc: { content: { size: number } }) => doc.content.size - 1;
const press = (state: EditorState) => {
  let next = state;
  const took = shiftReturn(schema)(state, (tr) => { next = state.apply(tr); });
  return { took, next };
};
const typed = (state: EditorState, text: string) => state.apply(state.tr.insertText(text));
const md = (state: EditorState) => chatMarkdown(state.doc.toJSON());

describe('Shift+Return in a chat box', () => {
  it('starts the next point of a bulleted list', () => {
    const { took, next } = press(at('- one', (d) => end(d) - 2));
    expect(took).toBe(true);
    expect(md(typed(next, 'two'))).toBe('- one\n- two');
  });

  it('starts the next number of a numbered list', () => {
    const { next } = press(at('1. one', (d) => end(d) - 2));
    expect(md(typed(next, 'two'))).toBe('1. one\n2. two');
  });

  it('ends the list on an empty point, so the next words are plain', () => {
    const second = press(at('- one', (d) => end(d) - 2)).next;
    const { took, next } = press(second);
    expect(took).toBe(true);
    expect(md(typed(next, 'after'))).toBe('- one\n\nafter');
  });

  it('is a new line inside a code block, not a way out of it', () => {
    const { took, next } = press(at('```\nlet a = 1\n```', (d) => end(d)));
    expect(took).toBe(true);
    expect(md(typed(next, 'let b = 2'))).toBe('```\nlet a = 1\nlet b = 2\n```');
  });

  it('starts a line of its own in a plain message, which still goes out one newline down', () => {
    const { took, next } = press(at('hello', (d) => end(d)));
    expect(took).toBe(true);
    const after = typed(next, 'world');
    expect(after.doc.childCount).toBe(2);
    expect(md(after)).toBe('hello\nworld');
  });

  it('lets the list button list only the line it is on, not the heading above it', () => {
    const heading = press(at('**Before the launch:**', (d) => end(d))).next;
    const point = typed(heading, 'pricing page says beta');
    let listed = point;
    formatCommand('bullet', schema)(point, (tr) => { listed = point.apply(tr); });
    expect(md(listed)).toBe('**Before the launch:**\n\n- pricing page says beta');
  });

  it('keeps the next line in a quote, and leaves the quote on an empty one', () => {
    const second = press(at('> a quote', (d) => end(d) - 1));
    expect(second.took).toBe(true);
    expect(md(typed(second.next, 'more of it'))).toBe('> a quote\n> more of it');
    const out = press(second.next);
    expect(out.took).toBe(true);
    expect(md(typed(out.next, 'after'))).toBe('> a quote\n\nafter');
  });

  it('brings a two-line quote back from a draft as the same two lines', () => {
    expect(chatMarkdown(chatDoc('> a quote\n> more of it', schema))).toBe('> a quote\n> more of it');
  });
});
