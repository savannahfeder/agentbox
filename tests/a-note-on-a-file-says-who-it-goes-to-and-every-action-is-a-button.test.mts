// A NOTE ON A FILE SAYS WHO IT GOES TO, AND EVERY ACTION ON IT IS A BUTTON.
//
// The founder pinned a note on a picture and only found out by testing that it
// had gone to the agent and started it working. Reply and Resolve were bare
// grey mono words that only showed on hover, so she took them for text, and
// the empty panel showed nothing but a box. Measured on a live copy: Enter in
// the box sent the note to the agent at once, while nothing on the page said
// so before the press. A "Send this note to the agent" button was also offered
// for a note on a file the agent never made, where main sends nothing.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { noteSendWords, notesToSendTheAgent } from '../renderer/src/artifact-pins.ts';
import { FileNoteCard } from '../renderer/src/components/FileNoteCard.tsx';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const people = [{ id: 'u-me', name: 'Ada Park' }, { id: 'u-sofia', name: 'Sofia Reyes' }, { id: 'u-maya', name: 'Maya Chen' }];
const nameOf = (id) => people.find((p) => p.id === id)?.name.split(' ')[0] ?? 'A teammate';
const words = (text, more = {}) => noteSendWords({ text, people, me: 'u-me', nameOf, agentMade: true, toAgent: true, owner: 'u-me', ...more });

describe('the send button names who the note goes to', () => {
  // Since 2026-11-08 a comment waits for Send unless it tags your agent
  // (a-comment-waits-until-you-send-it-or-tag-your-agent).
  it('a note on a file the agent made is a note for your agent until it tags the agent, before a word is typed too', () => {
    expect(words('')).toBe('Note for your agent');
    expect(words('Make the last bar orange')).toBe('Note for your agent');
    expect(words('@agent make the last bar orange')).toBe('Send to your agent');
  });
  it('a note that opens on a teammate goes to them, not the agent', () => {
    expect(words('Sofia, can you check the numbers?')).toBe('Send to Sofia');
    expect(words('what do you think @Maya')).toBe('Send to Maya');
  });
  it('a thank-you starts nothing, so it is only a comment', () => {
    expect(words('Thanks, looks good')).toBe('Comment');
  });
  it('where no agent will hear it, a teammate\'s file goes to them and your own is only a comment', () => {
    expect(words('Tighten this', { agentMade: false, owner: 'u-sofia' })).toBe('Send to Sofia');
    expect(words('Tighten this', { agentMade: false, owner: 'u-me' })).toBe('Comment');
    expect(words('Tighten this', { agentMade: true, toAgent: false, owner: null })).toBe('Comment');
  });
});

describe('Send this note to the agent', () => {
  const version = { id: 'chart.png', path: 'chart.png', name: 'chart.png', agent: '' };
  const note = (id, more = {}) => ({ id, file: 'chart.png', place: { kind: 'whole' }, text: 'Make it bigger', by: 'u-me', ts: 1, mentions: [], ...more });
  it('offers an open note the agent was not sent', () => {
    expect(notesToSendTheAgent({ notes: [note('a')] }, version, 1, people, 'u-me')).toEqual(['a']);
  });
  it('leaves out one already sent, resolved, or written to a teammate', () => {
    const notes = [note('a', { sent: true }), note('b', { resolved: true }), note('c', { text: 'Sofia, look' })];
    expect(notesToSendTheAgent({ notes }, version, 1, people, 'u-me')).toEqual([]);
  });
  it('is never offered on a file the agent did not make, where pressing it would send nothing', () => {
    const attached = { ...version, agent: undefined };
    expect(notesToSendTheAgent({ notes: [note('a')] }, attached, 1, people, 'u-me')).toEqual([]);
  });
});

describe('the card', () => {
  const base = {
    note: { id: 'n1', file: 'chart.png', place: { kind: 'pin', x: 0.7, y: 0.3 }, pin: 1, text: 'Make the last bar orange', by: 'u-me', ts: 0, mentions: [], owner: null, uid: null, sent: true },
    wordsGone: false, active: false, settling: false, person: () => null, me: 'u-me', onGo: () => {}, onSettle: () => {}, nameOf,
    replying: false, onReplying: () => {}, onReply: async () => true, canReply: true, held: null, onToAgent: () => {},
  };
  const html = (more = {}) => renderToStaticMarkup(React.createElement(FileNoteCard, { ...base, ...more }));
  const button = (h, word) => h.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${word}</button>`))?.[0] ?? '';

  it('Reply and Resolve are buttons with an icon beside the word', () => {
    expect(button(html(), 'Reply')).toMatch(/<svg/);
    expect(button(html(), 'Resolve')).toMatch(/<svg/);
  });
  it('says the note went to the agent', () => {
    expect(html()).toContain('Sent to the agent');
  });
  it('draws its pin as the tag on the picture, not the words "Pin 1"', () => {
    expect(html()).toMatch(/class="av-pin-tag[^"]*"[^>]*>1</);
    expect(html().replace(/<[^>]*>/g, ' ')).not.toContain('Pin 1');
  });
  it('a note waiting for Send says Not sent, and Send itself is above the comments, not on each one', () => {
    const h = html({ note: { ...base.note, sent: false, wait: true }, held: { words: 'Not sent', went: false } });
    expect(h).toContain('Not sent');
    expect(button(h, 'Send to the agent')).toBe('');
  });
  it('a resolved note offers Reopen, and one just resolved offers Undo, both as buttons with icons', () => {
    expect(button(html({ note: { ...base.note, resolved: true } }), 'Reopen')).toMatch(/<svg/);
    expect(button(html({ settling: true, note: { ...base.note, resolved: true } }), 'Undo')).toMatch(/<svg/);
  });
  it('replying offers a Reply button and a way out, not only the Enter key', () => {
    const h = html({ replying: true });
    expect(button(h, 'Cancel')).toBeTruthy();
    expect(h).toMatch(/<button[^>]*type="submit"[^>]*>(?:(?!<\/button>).)*Reply<\/button>/);
  });
});

describe('the panel', () => {
  const view = read('renderer/src/components/ArtifactView.tsx');
  const css = read('renderer/src/components/artifact-view.css');
  const rule = (sel) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

  it('an empty panel says how to pin a note', () => {
    expect(view).toMatch(/className="av-empty"/);
    expect(view).toContain('Click the picture to pin a note');
  });
  it('the box has a send button that says who it goes to', () => {
    expect(view).toMatch(/className="av-btn av-write-send"[^>]*>[\s\S]{0,220}\{buttonWords\}/);
    expect(view).toMatch(/const buttonWords = justSent && !words\.trim\(\) && !pictures\.length \? justSent : sendWords;/);
  });
  it('the card\'s buttons are always there, never shown only on hover', () => {
    expect(css).not.toMatch(/\.av-note-act[^{]*\{[^}]*opacity: 0/);
  });
  it('every button in the panel is one height, outlined, with soft corners', () => {
    for (const sel of ['.av-btn', '.av-note-act']) {
      expect(rule(sel), sel).toMatch(/height: 28px/);
      expect(rule(sel), sel).toMatch(/border: 1px solid/);
      expect(rule(sel), sel).toMatch(/border-radius: var\(--radius\)/);
    }
  });
  it('buttons side by side never touch', () => {
    const gap = Number(rule('.av-note-acts').match(/gap: (?:\d+px )?(\d+)px/)?.[1]);
    expect(gap).toBeGreaterThanOrEqual(4);
  });
  it('no mono words in the card', () => {
    for (const sel of ['.av-note-acts', '.av-note-place', '.av-settled']) expect(rule(sel), sel).not.toMatch(/--mono/);
  });
});
