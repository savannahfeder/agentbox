// A PERSON'S CHAT SHOWS THREADS AS CARDS AND ITS LINES CLOSE TOGETHER (w-f702d60afe, 2026-11-20).
//
// The founder, on Theo's page before a first message: "a while back we made
// the chat UI a lot cleaner ... Now things are a little weird, including the
// spacing and the input field. Sometimes when I make threads, it looks visually
// weird." Measured on the page at 1512 wide:
// - a thread you gave or asked about was two lines of text, "Asked Theo for a
//   review" at message size and the title faint under it, and nothing said it opened;
// - before a first message that row had a 16px face, the full name and no
//   indent, so it changed shape once the chat began;
// - one sender's lines sat 31px apart, 16px text on a 25px line plus 6px, so
//   each line read as its own paragraph;
// - the faces were 32px and sat 2px under the name's line, so they hung low
//   beside it (founder: "It doesn't really match Slack"); at 36px she found
//   them "still too large", so they are 28px with their top on the name's;
// - the box was 79px tall at rest: the field, then a row of tools and a
//   bordered Send holding a second box with "Enter" in it. It became one line
//   with the tools at its right, which the founder then found messy and unlike
//   Slack (w-f689c07680): the words wrapped beside an empty column. It is
//   stacked again, and Send is an arrow with no key in it
//   (tests/the-chat-box-is-its-words-then-its-files-then-its-tools).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AlongHistory } from '../renderer/src/team/rooms/RoomChat.tsx';
import { THREAD_KINDS } from '../renderer/src/team/pair-timeline.ts';
globalThis.React = React;

const at = new Date('2026-11-20T10:14:00').getTime();
const people: Record<string, { name: string; avatarUrl: null; me?: boolean }> = {
  sam: { name: 'Sam O.', avatarUrl: null, me: true },
  theo: { name: 'Theo O.', avatarUrl: null },
};
const drawn = (rows: Parameters<typeof AlongHistory>[0]['rows']) =>
  renderToStaticMarkup(React.createElement(AlongHistory, { rows, who: (id: string) => people[id] }));
const asked = { key: 'task:1', at, by: 'sam', text: 'Asked Theo for a review', where: { label: 'Add an idempotency key to POST /payments', onOpen: () => {} }, card: true };
const comment = { key: 'comment:1', at: at + 60_000, by: 'theo', text: 'The expiry should be a day.', where: { label: 'on Add an idempotency key to POST /payments', onOpen: () => {} } };

describe('a thread that passed between two people, in their chat', () => {
  it('is a card that opens it, its title first and what happened under it', () => {
    const html = drawn([asked]);
    expect(html).toMatch(/<button type="button" class="rm-thread-card"><span class="rm-thread-title">Add an idempotency key to POST \/payments<\/span><span class="rm-thread-what">Asked Theo for a review<\/span><\/button>/);
    expect(html).not.toContain('rm-there');
  });

  it('leaves a comment as words, with where it was left under them', () => {
    const html = drawn([comment]);
    expect(html).not.toContain('rm-thread-card');
    expect(html).toContain('<div class="tx">The expiry should be a day.</div>');
    expect(html).toContain('class="rm-there"');
  });

  it('is a card for a task, a hand-off, an ask and its answer, and not for words', () => {
    for (const k of ['task', 'handoff', 'help', 'review', 'back'] as const) expect(THREAD_KINDS.has(k)).toBe(true);
    for (const k of ['message', 'reply', 'comment', 'note'] as const) expect(THREAD_KINDS.has(k)).toBe(false);
  });
});

describe('what you did together, before a first message', () => {
  it('is drawn as the chat will be: the hanging face, "You", the chat\'s names', () => {
    const html = drawn([asked, comment]);
    expect(html).toMatch(/^<div class="rm-full hang pl-history">/);
    expect(html).toContain('<span>You</span>');
    expect(html).toContain('<span>Theo O.</span>');
    expect(html).not.toContain('Sam O.');
    expect(html).toMatch(/width:28px/);
  });
});

describe('a person\'s or a group\'s chat', () => {
  const css = fs.readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');
  const rule = (sel: string) => {
    const m = new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(css);
    return m ? m[2] : '';
  };

  it('keeps one sender\'s lines close and sets a new sender apart', () => {
    expect(rule('.gr-page .rm-full .rm-cm')).toMatch(/padding-top: 14px; padding-bottom: 2px;/);
    expect(rule('.gr-page .rm-full .rm-cm.cont')).toMatch(/padding-top: 0;/);
    expect(rule('.gr-page .rm-full .rm-cm .tx')).toMatch(/line-height: 24px/);
  });

  it('draws a 28px face, its top level with the top of the name\'s line', () => {
    expect(rule('.gr-page .rm-full .rm-cm')).toMatch(/padding-top: 14px/);
    expect(rule('.gr-page .rm-full.hang .rm-cm .h > .tm-av:first-child')).toMatch(/top: 14px/);
    expect(rule('.gr-page .rm-full.hang .rm-cm')).toMatch(/padding-left: 40px/);
    expect(fs.readFileSync(new URL('../renderer/src/team/rooms/RoomChat.tsx', import.meta.url), 'utf8')).toContain('size={hang ? 28 : 16}');
  });

  it('has a box with its words across it and its tools under them, Send with no key inside', () => {
    expect(rule('.gr-page .rm-compose')).toBe('');
    expect(rule('.rm-compose')).toMatch(/flex-direction: column;/);
    expect(fs.readFileSync(new URL('../renderer/src/team/ChatSend.tsx', import.meta.url), 'utf8')).not.toContain('<kbd>');
  });
});

// Round eleven: "Started on this in a thread of my own: [Overlapping appointments
// bug investigation](https://app.agentbox.ac/t/…)" was drawn with its brackets
// and the whole address across two lines.
describe('a line of what passed between you', () => {
  it('shows a Markdown link as its words', async () => {
    const { linksAsWords } = await import('../renderer/src/team/pair-timeline.ts');
    expect(linksAsWords('Started on this in a thread of my own: [Overlapping appointments](https://app.agentbox.ac/t/a/w-557f3877ba)'))
      .toBe('Started on this in a thread of my own: Overlapping appointments');
    expect(linksAsWords('See [the table](/t/a/w-1234567890) and [notes](https://example.com/n).')).toBe('See the table and notes.');
  });
  it('leaves brackets that are not a link alone', async () => {
    const { linksAsWords } = await import('../renderer/src/team/pair-timeline.ts');
    expect(linksAsWords('Use [x] for done (see list)')).toBe('Use [x] for done (see list)');
  });
});

// Round eleven: a reply typed in the person chat, sent while the app could not
// reach the cloud, was gone after the app restarted. The box kept its words in
// memory only.
describe('the chat box', () => {
  it('keeps what you are writing in the draft store, which outlives a restart', () => {
    const src = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomChat.tsx', import.meta.url), 'utf8');
    expect(src).toContain("const [text, setText] = useState(() => readDraft(draftAt));");
    expect(src).toContain('useEffect(() => { saveDraft(draftAt, text); }, [draftAt, text]);');
    expect(src).not.toContain('new Map<string, string>()');
  });
});

// Round eleven's screenshot: "Sam, here is the validation audit table." and
// "Can you open the document" sat a blank line plus the paragraph gap apart.
// The message box keeps line breaks (pre-wrap), and Markdown puts one between
// its paragraphs, so each gap drew an extra line.
describe('two paragraphs in a chat message', () => {
  it('are the paragraph gap apart, with no blank line between', async () => {
    const { renderToStaticMarkup: draw } = await import('react-dom/server');
    const { default: Md } = await import('react-markdown');
    expect(draw(React.createElement(Md, null, 'One.\n\nTwo.'))).toBe('<p>One.</p>\n<p>Two.</p>');
    const css = fs.readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');
    expect(css).toContain('.rm-cm .tx:has(> p, > ul, > ol, > pre, > blockquote) { white-space: normal; }');
  });
});
