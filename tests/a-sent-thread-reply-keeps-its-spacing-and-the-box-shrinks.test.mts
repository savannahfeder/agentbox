// Thread replies lost paragraph gaps outside the chat's markdown wrapper, and
// measuring the editor before it cleared left an empty box at its old height.
// Check the panel's styles and the message's newline round trip. Paragraph
// gaps follow Slack's compact spacing rather than adding a whole blank line.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { chatDoc, chatMarkdown } from '../renderer/src/team/chat-editor.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('renderer/src/team/chat.css').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (selector) => css.slice(css.indexOf(`${selector} {`)).split('}')[0];

describe('a sent reply in the thread panel', () => {
  it('gives separate paragraphs a compact gap without depending on a markdown wrapper', () => {
    expect(rule('.msg-body.chat-lines > p + p')).toMatch(/margin-top:\s*8px/);
    expect(rule('.msg-body.chat-lines p')).toContain('white-space: pre-line');
  });

  it.each(['one\ntwo', 'one\n\ntwo', '**one**\n\n*two*', '- one\n- two'])('keeps the lines and formatting of %j', (text) => {
    expect(chatMarkdown(chatDoc(text))).toBe(text);
  });

  it('lets the editor size itself instead of measuring the old draft before it clears', () => {
    const panel = read('renderer/src/team/ThreadPanel.tsx');
    expect(panel).not.toMatch(/el\.style\.height\s*=/);
    expect(rule('.chat-thread-input')).toContain('min-height: 82px');
    expect(rule('.chat-thread-input')).toContain('max-height: 240px');
    expect(rule('.chat-thread-input')).toContain('overflow-y: auto');
  });
});
