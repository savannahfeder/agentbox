// "I thought we improved the UI, but these don't match the new UI we chose,
// right?" Put beside the round-6 pictures you approved (designs/w-4bd7b5548b/
// round-6, chat-a and teammate-b), the built Chats page had kept the old team
// chat's look: day labels in capitals in the mono face, clock times in mono,
// square faces, names in the body weight, and what a teammate sent you as a
// line ending in "WAITING ON YOU" rather than a card with a button. The list
// sat on the same white as the chat. These pin the round-6 look, scoped to the
// Chats page so the groups' own chat is unchanged.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`../renderer/src/teammates/${f}`, import.meta.url), 'utf8');
const css = read('teammates.css');
const page = read('TeammatesPage.tsx');
const rule = (sel) => {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('a teammate\'s chat', () => {
  it('says the day in plain words between two lines, not in mono capitals', () => {
    expect(rule('.tq-chats .tq-chat .rm-day')).toMatch(/display: flex/);
    expect(rule('.tq-chats .tq-chat .rm-day .rm-label')).toMatch(/text-transform: none/);
    expect(rule('.tq-chats .tq-chat .rm-day .rm-label')).toMatch(/font: inherit/);
    expect(css).toMatch(/\.tq-chats \.tq-chat \.rm-day::before, \.tq-chats \.tq-chat \.rm-day::after \{[^}]*background: var\(--line\)/);
  });

  it('draws names in the heavier weight, times in the body face, and soft-cornered faces', () => {
    expect(rule('.tq-chats .tq-chat .rm-cm.tq-m .h > span')).toMatch(/font-weight: 600/);
    expect(rule('.tq-chats .tq-chat .rm-cm.tq-m .h em')).toMatch(/font-family: inherit/);
    expect(rule('.tq-chats .tq-chat .rm-cm.tq-m .h .rm-pic')).toMatch(/border-radius: 6px/);
    expect(rule('.tq-chats .tq-chat .rm-cm.tq-m .h .tq-pic')).toMatch(/border-radius: 6px/);
  });

  it('shows what it sent you in its own block after its name', () => {
    const chat = page.slice(page.indexOf('function ChatColumn('), page.indexOf('\nfunction ', page.indexOf('function ChatColumn(') + 10));
    // Since 2026-10-26 the card is the thread's own inbox row
    // (a-thread-a-teammate-sent-you-looks-like-its-row-in-your-inbox).
    expect(chat).toMatch(/e\.verb === 'sent'[\s\S]{0,300}<SentCard /);
    expect(page).toMatch(/function SentCard\(/);
  });

  it('lets you tap an answer on soft-cornered buttons', () => {
    expect(rule('.tq-chats .tq-chip')).toMatch(/border-radius: 6px/);
  });
});

describe('the Chats list and a teammate\'s details', () => {
  it('sits on the page\'s own background, with round faces for people', () => {
    expect(rule('.cx-list')).toMatch(/background: var\(--bg\)/);
    expect(css).toMatch(/\.cx-row img[^{]*\{[^}]*border-radius: 50%/);
  });

  it('picks where it works from a short menu, not a row of buttons', () => {
    const details = page.slice(page.indexOf('function Details('), page.indexOf('\nfunction ', page.indexOf('function Details(') + 10));
    expect(details).toMatch(/<dt>Works in<\/dt>\s*<dd>\{real\.length > 1\s*\? <PickOne /);
    expect(page).toMatch(/function PickOne\(/);
  });

  it('keeps the details beside it on the page\'s own background', () => {
    expect(rule('.gr-side.tq-details')).toMatch(/background: var\(--bg\)/);
  });
});
