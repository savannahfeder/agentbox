// SHARE… SENDS A THREAD BY LINK OR TO A TEAMMATE'S INBOX (w-d19fcb9309).
//
// Two copies on one stand-in team, 2026-11-09: a thread could be marked Team
// or Private only in the new-thread box. Once sent, nothing on its page said
// who could open it or offered to send it to anyone; the one panel with
// "Who sees it" never drew on the page Needs you opens. The founder's words:
// sharing is mostly sending someone a link, sometimes putting it in their
// inbox, and only partly who can see it; and it belongs in the ⋯ menu.
// Approved pictures: send-0-menu (Share… first in ⋯), send-2 (Copy link, Send
// to Theo, Send to someone…, Who can open it), send-3 (To, a note, Send to
// inbox), send-4 (Link copied, or put it in an inbox), team-1 (the Team page
// before there is a team).
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { threadLink, threadOfLink, sendFirst, seenWord, matchPeople, openTo, sentWords, firstName } from '../renderer/src/threads/share-rules.ts';
import { whereALinkGoes } from '../renderer/src/link-click.ts';
import { threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';
import { ShareList, SendSheet, CopiedSheet, SeeList } from '../renderer/src/threads/SharePanel.tsx';
import { emailsIn, StartTeam } from '../renderer/src/team/StartTeam.tsx';
globalThis.React = React;

const THEO = { id: 'p-theo', name: 'Theo Park', email: 'theo@lumen.test' };
const JUN = { id: 'p-jun', name: 'Jun Ito', email: 'jun@lumen.test' };
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('a thread\'s link', () => {
  it('is our web app\'s address with the owner and the thread', () => {
    expect(threadLink('p-maya', 'w-1a2b3c4d5e')).toBe('https://app.agentbox.ac/t/p-maya/w-1a2b3c4d5e');
  });
  it('is made for no owner, and for ids that would bend the path', () => {
    expect(threadLink(null, 'w-1')).toBeNull();
    expect(threadLink('p-maya', '../x')).toBeNull();
    expect(threadLink('p/maya', 'w-1')).toBeNull();
  });
  it('reads back to its owner and thread, on either of our addresses', () => {
    expect(threadOfLink('https://app.agentbox.ac/t/p-maya/w-1')).toEqual({ owner: 'p-maya', id: 'w-1' });
    expect(threadOfLink('https://agentbox-phone.pages.dev/t/p-maya/w-1/')).toEqual({ owner: 'p-maya', id: 'w-1' });
  });
  it('is not read from anyone else\'s site, plain http, a file link or a longer path', () => {
    expect(threadOfLink('https://evil.example/t/p-maya/w-1')).toBeNull();
    expect(threadOfLink('http://app.agentbox.ac/t/p-maya/w-1')).toBeNull();
    expect(threadOfLink('https://app.agentbox.ac/f/abcdefabcdefabcd')).toBeNull();
    expect(threadOfLink('https://app.agentbox.ac/t/p-maya/w-1/extra')).toBeNull();
    expect(threadOfLink('not a link')).toBeNull();
  });
  it('opens the thread when clicked in the app, and goes out on a ⌘-click like any link', () => {
    expect(whereALinkGoes('https://app.agentbox.ac/t/p-maya/w-1')).toBe('thread');
    expect(whereALinkGoes('https://app.agentbox.ac/t/p-maya/w-1', { metaKey: true })).toBe('outside');
    expect(whereALinkGoes('https://example.com/t/p-maya/w-1')).not.toBe('thread');
  });
});

describe('the ⋯ menu', () => {
  it('puts Share… first, in Add people\'s place', () => {
    const rows = threadMenuRows({ change: false, terminal: 'closed', finish: true, share: true, people: true, later: 'key' });
    expect(rows[0]).toMatchObject({ id: 'share', label: 'Share…' });
    expect(rows.map((r) => r.id)).not.toContain('people');
  });
  it('keeps Add people where there is nothing to share', () => {
    const rows = threadMenuRows({ change: false, terminal: 'closed', finish: true, people: true });
    expect(rows.map((r) => r.id)).toContain('people');
    expect(rows.map((r) => r.id)).not.toContain('share');
  });
});

describe('Share…', () => {
  const list = (o = {}) => text(renderToStaticMarkup(React.createElement(ShareList, {
    link: true, first: THEO, others: true, seen: 'Lumen', onCopy() {}, onSendFirst() {}, onSendOther() {}, onSee() {}, ...o,
  })));
  it('says Copy link, Send to the teammate named, Send to someone…, and who can open it, in that order', () => {
    const t = list();
    expect(t.indexOf('Copy link')).toBeLessThan(t.indexOf('Send to Theo'));
    expect(t.indexOf('Send to Theo')).toBeLessThan(t.indexOf('Send to someone…'));
    expect(t.indexOf('Send to someone…')).toBeLessThan(t.indexOf('Who can open it'));
    expect(t).toContain('Lumen');
  });
  it('offers nobody to send to on a team of one, and no link where there is none', () => {
    const t = list({ first: null, others: false, link: false });
    expect(t).not.toContain('Send to');
    expect(t).not.toContain('Copy link');
    expect(t).toContain('Who can open it');
  });
  it('names the teammate last sent to while they are still on the team, else the first', () => {
    expect(sendFirst([THEO, JUN], 'p-jun')).toBe(JUN);
    expect(sendFirst([THEO, JUN], 'p-gone')).toBe(THEO);
    expect(sendFirst([], 'p-jun')).toBeNull();
  });
  it('says who can open it in one word', () => {
    expect(seenWord('team', 'Lumen')).toBe('Lumen');
    expect(seenWord('team', '')).toBe('Team');
    expect(seenWord('private', 'Lumen')).toBe('Only you');
    expect(seenWord('people', 'Lumen', 1)).toBe('1 person');
    expect(seenWord('people', 'Lumen', 3)).toBe('3 people');
  });
  it('ticks the choice it is now', () => {
    const html = renderToStaticMarkup(React.createElement(SeeList, { seen: 'private', teamName: 'Lumen', onPick() {} }));
    expect(text(html)).toContain('Everyone at Lumen');
    expect(html).toMatch(/aria-current="true"[^>]*>.*Only you/);
  });
});

describe('Send to someone', () => {
  it('finds a teammate by the start of a name or email, leaving out who is picked', () => {
    expect(matchPeople([THEO, JUN], 'th', [])).toEqual([THEO]);
    expect(matchPeople([THEO, JUN], 'ito', [])).toEqual([JUN]);
    expect(matchPeople([THEO, JUN], 'lumen', ['p-theo'])).toEqual([JUN]);
    expect(matchPeople([THEO, JUN], 'zz', [])).toEqual([]);
  });
  it('draws To, a note, Copy link and Send to inbox', () => {
    const t = text(renderToStaticMarkup(React.createElement(SendSheet, { people: [THEO], start: ['p-theo'], link: true, onCopy() {}, onSend() {} })));
    expect(t).toMatch(/^To Th\w* Theo/);
    expect(t).toContain('Copy link');
    expect(t).toContain('Send to inbox');
  });
  it('opens a private or chosen thread to whoever it goes to, and leaves a Team thread Team', () => {
    expect(openTo('team', [], ['p-theo'])).toEqual({ visibility: 'team', visibleTo: ['p-theo'] });
    expect(openTo('private', undefined, ['p-theo'])).toEqual({ visibility: 'people', visibleTo: ['p-theo'] });
    expect(openTo('people', ['p-jun'], ['p-theo', 'p-jun'])).toEqual({ visibility: 'people', visibleTo: ['p-jun', 'p-theo'] });
  });
  it('arrives as the thread\'s name linked, then the note', () => {
    const link = 'https://app.agentbox.ac/t/p-maya/w-1';
    expect(sentWords('Release notes [draft]', link, '')).toBe(`[Release notes draft](${link})`);
    expect(sentWords('Release notes', link, '  Can you check the tone?  ')).toBe(`[Release notes](${link})\n\nCan you check the tone?`);
    expect(threadOfLink(/\((.*)\)/.exec(sentWords('x', link, ''))[1])).toEqual({ owner: 'p-maya', id: 'w-1' });
  });
});

describe('after Copy link', () => {
  it('says the link is copied, shows it, and offers an inbox', () => {
    const t = text(renderToStaticMarkup(React.createElement(CopiedSheet, { link: 'https://app.agentbox.ac/t/p-maya/w-1', people: [THEO], onSend() {} })));
    expect(t).toContain('Link copied');
    expect(t).toContain('app.agentbox.ac/t/p-maya/w-1');
    expect(t).not.toContain('https://');
    expect(t).toContain('Or put it in an inbox');
    expect(firstName(THEO)).toBe('Theo');
  });
});

describe('the Team page before there is a team', () => {
  it('is your face, two open seats and Start a team', () => {
    const t = text(renderToStaticMarkup(React.createElement(StartTeam, { me: { id: 'p-maya', name: 'Maya Chen' } })));
    expect(t).toContain('Bring your team in');
    expect(t).toContain('Start a team');
  });
  it('takes emails typed with commas or spaces, each once, and keeps the half-typed one', () => {
    expect(emailsIn('theo@lumen.test, jun@lumen.test, mi')).toEqual({ emails: ['theo@lumen.test', 'jun@lumen.test'], rest: 'mi' });
    expect(emailsIn('Theo@Lumen.test ', ['theo@lumen.test'])).toEqual({ emails: ['theo@lumen.test'], rest: '' });
    expect(emailsIn('not-an-email ')).toEqual({ emails: [], rest: '' });
  });
});
