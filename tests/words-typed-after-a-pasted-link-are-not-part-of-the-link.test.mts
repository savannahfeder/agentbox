// A tester pasted a shared link into a reply to Ana and typed on: every word
// after it went out inside the link, "[http://…/f/a3ac… Could you confirm you
// can open it? …](http://…/f/a3ac…)", and drew as one long underline (power
// test, 2026-11-11). TipTap's Link with autolink is an inclusive mark, so it
// grew to take what was typed at its end. The chat box and the document editor
// now end a link where its address ends.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { chatSchema, chatDoc, chatMarkdown } from '../renderer/src/team/chat-editor.ts';

const schema = chatSchema();
const typedAtEnd = (md: string, typed: string) => {
  const doc = schema.nodeFromJSON(chatDoc(md, schema));
  const end = doc.content.size - 1;
  const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, end) });
  return chatMarkdown(state.apply(state.tr.insertText(typed)).doc.toJSON());
};

describe('a link in the chat box', () => {
  it('ends where its address ends when you type on after it', () => {
    const out = typedAtEnd('Here it is: [https://agentbox.ac/f/abc123abc123abc123](https://agentbox.ac/f/abc123abc123abc123)', ' Could you confirm you can open it?');
    expect(out).toContain('](https://agentbox.ac/f/abc123abc123abc123) Could you confirm you can open it?');
    expect(out).not.toMatch(/Could you confirm[^\n]*\]\(/);
  });
  it('is still a link, and words typed before it stay plain', () => {
    expect(schema.marks.link.spec.inclusive).toBe(false);
    expect(typedAtEnd('Plain words', ' more')).toBe('Plain words more');
  });
});

describe('a link in the document editor', () => {
  it('is set up the same way', () => {
    const src = fs.readFileSync(new URL('../renderer/src/editor/extensions.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\bLink\.configure\(/);
    expect(src).toMatch(/EndingLink\.configure\(/);
  });
});
