// A NEW LINE IN A CHAT MESSAGE STAYS A NEW LINE (w-0d55a2b160).
//
// Found while making the chat's reply box show its formatting. A message
// between people is drawn as markdown (Thread.tsx's chat path), and markdown
// joins two lines with one newline between them into one line. Measured with
// react-markdown and remark-gfm, the pair the thread uses:
//   'one\ntwo'  =>  <p>one\ntwo</p>
// and nothing in chat.css honoured that newline, so "one" and "two", typed on
// two lines, were read as "one two". The new box sends Return as one newline
// (team/chat-editor.ts), so this had to hold or every line somebody typed would
// run into the next.
//
// A person's message keeps its newlines; an agent's paragraphs in the same
// chat are left to markdown, which is what an agent writes for.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatFold } from '../renderer/src/team/ChatFold.tsx';

const src = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

describe('a message a person wrote in a chat', () => {
  it('is drawn in a body that keeps its line breaks', () => {
    const html = renderToStaticMarkup(createElement(ChatFold, { lines: true }, 'x'));
    expect(html).toMatch(/class="msg-body chat-lines"/);
    const css = src('renderer/src/team/chat.css');
    expect(css).toMatch(/\.msg-body\.chat-lines p \{[^}]*white-space: pre-line/);
  });

  it('is not, when an agent wrote it', () => {
    const html = renderToStaticMarkup(createElement(ChatFold, null, 'x'));
    expect(html).not.toContain('chat-lines');
  });

  it('is asked for by the chat and by the thread panel, for people only', () => {
    expect(src('renderer/src/components/Thread.tsx')).toMatch(/<ChatFold lines=\{e\.who === 'you'\}[\s>]/);
    expect(src('renderer/src/team/ThreadPanel.tsx')).toMatch(/<ChatFold lines[\s>]/);
  });
});
