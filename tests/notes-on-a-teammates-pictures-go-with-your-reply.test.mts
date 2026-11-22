// NOTES ON A TEAMMATE'S PICTURES GO WITH YOUR REPLY (2026-11-22).
//
// Reviewing Theo's thread, a note pinned on one of his pictures went to him on
// its own the moment it was written ("Send to Theo"), one message per note, and
// the reply that answered the review never said a word about them. The founder:
// "if I comment on the pictures, that needs to be handled well. Those comments
// probably need to go to Theo in an elegant way." While a review is open on you,
// a note now says "Add to your reply" and waits, addressed to nobody; your reply
// carries every such note under the name of its picture, as one message, and
// marks them sent. Neither side draws a held note as a message of its own, so
// it is said once, in the reply. Measured by wording the notes, drawing the
// thread from its lines, and reading the page and the viewer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { notesWithYourReply } from '../renderer/src/threads/teammate-thread';
import { noteSentWords } from '../renderer/src/artifact-pins';
import { threadEvents } from '../renderer/src/thread-history';
import { CommentBox } from '../renderer/src/threads/TeammateThread.tsx';
import type { FileNote } from '../shared/artifact-marks.mts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const note = (o: Partial<FileNote>): FileNote => ({
  id: 'n1', file: 'f3', place: { kind: 'pin', x: 0.3, y: 0.4 }, text: 'The focus ring is hard to see.', by: 'me', ts: 2_000,
  mentions: [], owner: null, uid: null, pin: 1, wait: true, ...o,
} as FileNote);
const names = [{ id: 'f1', name: '1-before.png' }, { id: 'f3', name: '3-after-enter.png' }];
const askedAt = 1_000;

describe('the notes your reply carries', () => {
  it('are said under the name of each picture, in the order you wrote them', () => {
    const out = notesWithYourReply([
      note({ id: 'a', file: 'f3', pin: 1, text: 'The focus ring is hard to see.' }),
      note({ id: 'b', file: 'f1', place: { kind: 'whole' } as FileNote['place'], pin: undefined, text: 'Keep this one.' }),
      note({ id: 'c', file: 'f3', pin: 2, text: 'Bigger, please.' }),
    ], names, 'me', askedAt);
    expect(out.text).toBe([
      'Notes on 3-after-enter.png:',
      '- Pin 1: The focus ring is hard to see.',
      '- Pin 2: Bigger, please.',
      '',
      'Notes on 1-before.png:',
      '- Whole file: Keep this one.',
    ].join('\n'));
    expect(out.ids).toEqual(['a', 'c', 'b']);
  });

  it('leave out notes that are not yours, went already, were addressed to someone, or came before the ask', () => {
    const out = notesWithYourReply([
      note({ id: 'theirs', by: 'theo' }),
      note({ id: 'sent', sent: true }),
      note({ id: 'resolved', resolved: true }),
      note({ id: 'named', mentions: ['theo'] }),
      note({ id: 'before', ts: 500 }),
      note({ id: 'kept' }),
    ], names, 'me', askedAt);
    expect(out.ids).toEqual(['kept']);
  });

  it('are nothing when none wait', () => {
    expect(notesWithYourReply([], names, 'me', askedAt)).toEqual({ text: '', ids: [] });
  });
});

describe('the thread', () => {
  const opening = { id: 'w-1', ts: 0, source: 'founder' as const, patch: { title: 'Profile row', body: 'Open the thread', status: 'open' } };
  const mark = (uid: string, by: string, extra: Record<string, unknown>) => ({
    id: 'w-1', ts: 3_000, source: 'system' as const, by, uid,
    patch: { artifact: { do: 'note', id: `n-${uid}`, file: 'f3', place: { kind: 'pin', x: 0.3, y: 0.4 }, text: 'Bigger', ...extra } },
  });
  const noteEvents = (lines: never[]) => threadEvents(lines).filter((e) => e.fileMark?.kind === 'note');

  it('draws no message for a teammate\'s note held for their reply', () => {
    expect(noteEvents([opening, mark('mark-1', 'nora', { wait: true })] as never[])).toEqual([]);
  });

  it('still draws a teammate\'s note written to you, and your own note waiting for your reply', () => {
    expect(noteEvents([opening, mark('mark-2', 'nora', { wait: true, mentions: ['theo'] })] as never[])).toHaveLength(1);
    const own = noteEvents([opening, mark('l-3', 'theo', { wait: true })] as never[]);
    expect(own).toHaveLength(1);
    expect(own[0].fileMark?.unsent).toBe(true);
  });

  it('keeps counting a held note\'s pin, so the pins after it keep their numbers', () => {
    const shown = noteEvents([opening, mark('mark-1', 'nora', { wait: true }), mark('mark-2', 'nora', { mentions: ['theo'] })] as never[]);
    expect(shown[0].fileMark?.place).toBe('Pin 2');
  });
});

describe('the page and the viewer', () => {
  const page = read('renderer/src/threads/TeammateThread.tsx');
  const viewer = read('renderer/src/components/ArtifactView.tsx');

  it('hands the review back with your words and the notes, then marks the notes sent', () => {
    expect(page).toContain('const held = reviewing && ask ? notesWithYourReply(marks.notes, versionNames, team?.me ?? null, ask.createdAt ?? 0) : null;');
    expect(page).toMatch(/const ok = await handBack\('done', \[text, held\?\.text\]\.filter\(Boolean\)\.join\('\\n\\n'\)\);/);
    expect(page).toMatch(/if \(held\?\.ids\.length\) void api\.teamMarkFile\(\{ personId, threadId, mark: \{ do: 'sent', on: held\.ids \} \}\)/);
  });

  it('opens a teammate\'s picture with its notes going into your reply while a review is open', () => {
    expect(page).toContain('withYourReply={reviewing}');
    expect(viewer).toContain("const sendWords = withYourReply ? ADD_TO_YOUR_REPLY : noteSendWords({ ...noteTo, text: words, nameOf });");
    expect(viewer).toMatch(/const mentions = withYourReply \? \[\] : /);
  });

  it('says where a note went', () => {
    expect(noteSentWords('Add to your reply')).toBe('Added to your reply');
    expect(noteSentWords('Send to Theo')).toBe('Sent to Theo');
  });

  it('says the notes go with the reply, and sends them with no words typed', () => {
    const box = (notes: number, draft = '') => renderToStaticMarkup(React.createElement(CommentBox, {
      owner: 'Theo', helping: false, notes, draft, setDraft() {}, sending: false, onSend() {}, open: true, onOpen() {}, onFold() {},
    }));
    expect(box(2)).toContain('Goes to Theo with your 2 notes.');
    expect(box(1)).toContain('Goes to Theo with your note.');
    expect(box(0)).toContain('Goes to Theo.');
    expect(box(2)).not.toMatch(/<button type="submit" class="dock-send" disabled/);
    expect(box(0)).toMatch(/<button type="submit" class="dock-send" disabled/);
  });
});
