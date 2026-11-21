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
  link: true, first: THEO, others: true, seen: 'Lumen', onCopy() {}, onSendFirst() {}, onSendOther() {}, onSee() {}, onAsk() {}, onHand() {}, onBack() {}, ...o,
} as never)));

describe('the thread menu', () => {
  it('has one row for sharing and handing off where both can be done', () => {
    const rows = threadMenuRows({ change: false, terminal: null, finish: true, share: true, give: true });
    expect(rows.filter((r) => r.id === 'share' || r.id === 'give').map((r) => r.label)).toEqual(['Share or hand off…']);
  });
  it('keeps Share… alone where it cannot be handed off, and Ask or hand off… where it cannot be shared', () => {
    expect(threadMenuRows({ change: false, terminal: null, finish: true, share: true }).map((r) => r.label)).toContain('Share…');
    expect(threadMenuRows({ change: false, terminal: null, finish: true, give: true }).map((r) => r.label)).toContain('Ask or hand off…');
  });
});

describe('the panel it opens', () => {
  it('starts with asking and handing over, then the link', () => {
    const t = list();
    expect(t.indexOf('Ask for help or a review…')).toBeLessThan(t.indexOf('Hand it over…'));
    expect(t.indexOf('Hand it over…')).toBeLessThan(t.indexOf('Copy link'));
  });
  it('says a send is a link, so it does not read as handing it over', () => {
    expect(list()).toContain('Send a link to Theo');
    expect(list()).not.toMatch(/Send to Theo/);
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
    expect(menu).toContain("start={giveStart} onBack={() => setGivingTo(null)}");
    expect(menu).toContain("if (givingFromShare) { setGivingFromShare(false); setSharing('list'); }");
  });
});
