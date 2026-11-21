// SHARE AND HAND OFF ARE ONE DOOR, WITH A WAY BACK (w-f702d60afe, 2026-11-21).
//
// The founder, wanting to hand a thread to a teammate: "I don't know the
// difference between sharing and handing off. These seem like the same thing.
// When I was trying to hand off, I naturally clicked Share and now I'm
// confused. I clicked Share and I can't seem to go back to the previous page."
// The menu had Share… and Ask or hand off… as two rows; Share's panel offered
// "Send to Margarette", which reads like handing it to her but only put a link
// in her inbox, and no panel under it had a way back.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';
import { ShareList, SeeList, PanelBack } from '../renderer/src/threads/SharePanel.tsx';
globalThis.React = React;

const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const THEO = { id: 'theo', name: 'Theo Okafor', email: 't@x', avatarUrl: null };
const list = (o = {}) => text(renderToStaticMarkup(React.createElement(ShareList, {
  link: true, others: true, seen: 'Lumen', onCopy() {}, onSendFirst() {}, onSendOther() {}, onSee() {}, onAsk() {}, onHand() {}, onBack() {}, ...o,
} as never)));

describe('the thread menu', () => {
  it('has one row for sharing and handing off where both can be done', () => {
    const rows = threadMenuRows({ change: false, terminal: null, finish: true, share: true, give: true });
    expect(rows.filter((r) => r.id === 'share' || r.id === 'give').map((r) => r.label)).toEqual(['Ask, hand over or share…']);
  });
  it('keeps Share… alone where it cannot be handed off, and Ask or hand over… where it cannot be shared', () => {
    expect(threadMenuRows({ change: false, terminal: null, finish: true, share: true }).map((r) => r.label)).toContain('Share…');
    expect(threadMenuRows({ change: false, terminal: null, finish: true, give: true }).map((r) => r.label)).toContain('Ask or hand over…');
  });
});

describe('the panel it opens', () => {
  it('starts with asking and handing over, then the link', () => {
    const t = list();
    expect(t.indexOf('Ask for help or a review…')).toBeLessThan(t.indexOf('Hand it over…'));
    expect(t.indexOf('Hand it over…')).toBeLessThan(t.indexOf('Copy link'));
  });
  it('says a send is a link, and has no one-click send that reads like handing it over', () => {
    // A review found "Send a link to Theo" was the panel's most clickable row and only sent a link.
    expect(list()).toContain('Send a link…');
    expect(list()).not.toMatch(/Send (a link )?to Theo/);
  });
  it('offers no hand-off rows where it cannot be handed off', () => {
    const t = list({ onAsk: undefined, onHand: undefined });
    expect(t).not.toContain('Hand it over');
    expect(t).not.toContain('Ask for help');
  });
});

describe('every panel under it', () => {
  it('has a Back row first', () => {
    expect(list().trim().startsWith('Back')).toBe(true);
    expect(text(renderToStaticMarkup(React.createElement(SeeList, { seen: 'team', teamName: 'Lumen', onPick() {}, onBack() {} } as never))).trim().startsWith('Back')).toBe(true);
    expect(renderToStaticMarkup(React.createElement(PanelBack, { label: 'Back', onBack() {} }))).toContain('role="menuitem"');
  });
  it('goes back to the panel it opened from', () => {
    const menu = fs.readFileSync(new URL('../renderer/src/threads/ThreadMenu.tsx', import.meta.url), 'utf8');
    expect(menu).toContain("onBack={() => setSharing(null)} />;");
    expect(menu).toContain("<SeeList seen={share.seen} teamName={share.teamName} onBack={() => setSharing('list')}");
    expect(menu).toContain("onBack={() => setSharing('see')} />");
    expect(menu).toMatch(/start=\{giveStart\} only=\{[^}]*\} onBack=\{\(\) => setGivingTo\(null\)\}/);
    expect(menu).toContain("if (givingFromShare) { setGivingFromShare(false); setSharing('list'); }");
    // Opened from the button under a message, Back closes it: the menu was never open.
    expect(menu).toContain('if (step) { close(false); return; }');
  });
});

describe('the sheet after picking a person', () => {
  it('offers only Help or Review when you came to ask, and no choice when you came to hand it over', async () => {
    const { GiveSheet } = await import('../renderer/src/threads/SharePanel.tsx');
    const sheet = (o: Record<string, unknown>) => text(renderToStaticMarkup(React.createElement(GiveSheet, { to: { id: 'theo', name: 'Theo Okafor' }, onGive() {}, onAsk() {}, ...o } as never)));
    const ask = sheet({ only: 'ask' });
    expect(ask).toContain('Help');
    expect(ask).toContain('Review');
    expect(ask).not.toContain('Hand over');
    const give = sheet({ only: 'give', start: 'give' });
    expect(give).not.toContain('Review');
    expect(give).toContain('Hand over to Theo');
    expect(give).toContain('Theo gets it as a task, with its conversation and files. It moves to your Done.');
  });
  it('names the person in the review prompt and shows the send key on the button', async () => {
    const { GiveSheet } = await import('../renderer/src/threads/SharePanel.tsx');
    const html = renderToStaticMarkup(React.createElement(GiveSheet, { to: { id: 'theo', name: 'Theo Okafor' }, onGive() {}, onAsk() {}, start: 'review' } as never));
    expect(html).toContain('What should Theo look at?');
    expect(html).toMatch(/Ask Theo to review<kbd>/);
  });
});

// A second review of the flow: asking from the button under a message listed
// AI teammates, and picking one handed the thread over at once; the heading
// said an AI teammate starts on it when none was listed; Help could go with no
// question; the hand-over line said "It closes for you".
describe('the second pass', () => {
  const menu = fs.readFileSync(new URL('../renderer/src/threads/ThreadMenu.tsx', import.meta.url), 'utf8');
  it('lists no AI teammate wherever you came to ask', () => {
    expect(menu).toContain("const listed = giveTo.filter((p) => !(((givingFromShare && giveStart === 'help') || !!step) && p.id.startsWith('mate:')));");
  });
  it('says an AI teammate starts on it only when one is listed', () => {
    expect(menu).toContain("(listed.some((p) => p.id.startsWith('mate:')) ? ' An AI teammate starts on it.' : '')");
  });
  it('holds Help with no step and no words', async () => {
    const { GiveSheet } = await import('../renderer/src/threads/SharePanel.tsx');
    const html = renderToStaticMarkup(React.createElement(GiveSheet, { to: { id: 'theo', name: 'Theo Okafor' }, onGive() {}, onAsk() {}, only: 'ask' } as never));
    expect(html).toMatch(/<button type="button" class="th-new sh-go" disabled="">Ask Theo to help/);
    const withStep = renderToStaticMarkup(React.createElement(GiveSheet, { to: { id: 'theo', name: 'Theo Okafor' }, onGive() {}, onAsk() {}, only: 'ask', step: 'Should I drop it?' } as never));
    expect(withStep).not.toMatch(/sh-go" disabled/);
  });
  it('asks the person taking it over what they should know, and says it moves to your Done', async () => {
    const { GiveSheet } = await import('../renderer/src/threads/SharePanel.tsx');
    const html = renderToStaticMarkup(React.createElement(GiveSheet, { to: { id: 'theo', name: 'Theo Okafor' }, onGive() {}, only: 'give', start: 'give' } as never));
    expect(html).toContain('placeholder="Anything Theo should know?"');
    expect(html).toContain('It moves to your Done.');
  });
  it('has a Cancel, since a click outside keeps a note with words in it', async () => {
    const { GiveSheet } = await import('../renderer/src/threads/SharePanel.tsx');
    const html = renderToStaticMarkup(React.createElement(GiveSheet, { to: { id: 'theo', name: 'Theo Okafor' }, onGive() {}, onCancel() {}, only: 'give', start: 'give' } as never));
    expect(html).toMatch(/>Cancel<\/button><button type="button" class="th-new sh-go"/);
    expect(menu).toContain('onCancel={() => close(true)}');
  });
});
