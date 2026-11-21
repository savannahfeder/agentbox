// SHIFT+RETURN IN A CHAT'S LIST STARTS THE NEXT POINT (w-f689c07680, 2026-11-21).
//
// The founder asked for the chat box to hold up "where you have formatting".
// Return sends a chat message, so Shift+Return is the only new line, and in a
// bulleted list it broke the line inside the same point: three points typed as
// three lines came out as one bullet holding three lines, and there was no way
// to a second bullet. In a code block it left the block for a new paragraph
// under it, so code could only ever be one line. Measured in the demo team's
// copy: "- one", Shift+Return, "two" drew one bullet with "one" and "two" in it.
//
// Now it is Slack's: Shift+Return starts the next point, on an empty point it
// ends the list, and in a code block it is a new line of code. Anywhere else it
// is still the line break it was.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { chatSchema, chatDoc, chatMarkdown, shiftReturn } from '../renderer/src/team/chat-editor.ts';

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

describe('Shift+Return in a chat box', () => {
  it('starts the next point of a bulleted list', () => {
    const { took, next } = press(at('- one', (d) => end(d) - 2));
    expect(took).toBe(true);
    expect(chatMarkdown(typed(next, 'two').doc.toJSON())).toBe('- one\n- two');
  });

  it('starts the next number of a numbered list', () => {
    const { next } = press(at('1. one', (d) => end(d) - 2));
    expect(chatMarkdown(typed(next, 'two').doc.toJSON())).toBe('1. one\n2. two');
  });

  it('ends the list on an empty point, so the next words are plain', () => {
    const second = press(at('- one', (d) => end(d) - 2)).next;
    const { took, next } = press(second);
    expect(took).toBe(true);
    expect(chatMarkdown(typed(next, 'after').doc.toJSON())).toBe('- one\n\nafter');
  });

  it('is a new line inside a code block, not a way out of it', () => {
    const { took, next } = press(at('```\nlet a = 1\n```', (d) => end(d)));
    expect(took).toBe(true);
    expect(chatMarkdown(typed(next, 'let b = 2').doc.toJSON())).toBe('```\nlet a = 1\nlet b = 2\n```');
  });

  it('leaves a plain line to the line break it always was', () => {
    expect(press(at('hello', (d) => end(d))).took).toBe(false);
  });

  it('leaves a quote to the line break too, which keeps the words in the quote', () => {
    expect(press(at('> a quote', (d) => end(d) - 1)).took).toBe(false);
  });
});
