// A THREAD'S LINK OPENS FOR THE TEAMMATE IT WAS SENT TO (w-d19fcb9309).
//
// The third synthetic team run (2026-11-09, Maya, Theo and Lena on one team):
// - Copy link said "The link could not be copied" every time, for all three:
//   the browser refused the clipboard and nothing else was tried.
// - Maya's Nov 7 thread said "Who can open it: Northwind", but it was started
//   before she began sharing, so it was never on the team's list. Send to Theo
//   put its link in his inbox and he got "Maya no longer shares that thread".
// - Lena's links arrived before her copy had published the thread's card, and
//   a click said the same "no longer shares" until the next sync.
// - Lena picked Who can open it › Chosen people… › Theo on a Team thread. It
//   said "Theo is on this thread now" and the thread stayed open to everyone:
//   the row opened Add people, which adds someone without narrowing anything.
// - Maya made a checklist Only you after it had been open to Theo and Lena,
//   then sent it to Theo alone. Lena could open it again: Send added Theo to
//   the people the thread had named before it went private.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { seenNow, copyText, choose, openTo } from '../renderer/src/threads/share-rules.ts';
import { ChooseList } from '../renderer/src/threads/SharePanel.tsx';
globalThis.React = React;

const SINCE = Date.parse('2026-11-09T10:00:00Z');
const TEAM = { seenBy: 'team' };

describe('who can open a thread, as Share… says it', () => {
  it('is Only you for a thread from before you began sharing that nobody shared', () => {
    expect(seenNow({ createdAt: SINCE - 2 * 86_400_000 }, TEAM, SINCE)).toBe('private');
  });
  it('is the team for a thread started after, in a team project', () => {
    expect(seenNow({ createdAt: SINCE + 1000 }, TEAM, SINCE)).toBe('team');
  });
  it('is the team for an old thread marked Team on purpose', () => {
    expect(seenNow({ createdAt: SINCE - 1000, visibility: 'team' }, TEAM, SINCE)).toBe('team');
  });
  it('is chosen people when it names some, and Only you when it names nobody', () => {
    expect(seenNow({ createdAt: SINCE + 1000, visibility: 'people', visibleTo: ['p-theo'] }, TEAM, SINCE)).toBe('people');
    expect(seenNow({ createdAt: SINCE + 1000, visibility: 'people', visibleTo: [] }, TEAM, SINCE)).toBe('private');
  });
  it('is Only you in a project kept private', () => {
    expect(seenNow({ createdAt: SINCE + 1000 }, { seenBy: 'private' }, SINCE)).toBe('private');
  });
  it('is the team with no start of sharing known', () => {
    expect(seenNow({ createdAt: 1 }, TEAM, null)).toBe('team');
  });
});

describe('copying a link', () => {
  const fakeDoc = (copies: boolean) => {
    const made: { value: string; removed: boolean }[] = [];
    return {
      made,
      createElement: () => { const el = { value: '', removed: false, style: {}, setAttribute() {}, select() {}, remove() { el.removed = true; } }; made.push(el); return el; },
      body: { appendChild() {} },
      execCommand: (cmd: string) => cmd === 'copy' && copies,
    };
  };
  it('uses the clipboard when the browser allows it', async () => {
    let put = '';
    const doc = fakeDoc(false);
    expect(await copyText('https://app.agentbox.ac/t/p/w-1', { clipboard: { writeText: async (t: string) => { put = t; } }, doc })).toBe(true);
    expect(put).toBe('https://app.agentbox.ac/t/p/w-1');
    expect(doc.made).toHaveLength(0);
  });
  it('copies from a hidden field when the clipboard is refused, and takes the field away', async () => {
    const doc = fakeDoc(true);
    expect(await copyText('https://app.agentbox.ac/t/p/w-1', { clipboard: { writeText: async () => { throw new Error('denied'); } }, doc })).toBe(true);
    expect(doc.made[0].value).toBe('https://app.agentbox.ac/t/p/w-1');
    expect(doc.made[0].removed).toBe(true);
  });
  it('says it failed only when both ways fail', async () => {
    expect(await copyText('x', { clipboard: undefined, doc: fakeDoc(false) })).toBe(false);
  });
});

describe('sending a thread that is Only you', () => {
  it('opens it to the people sent to and nobody it named before', () => {
    expect(openTo('private', ['p-theo', 'p-lena'], ['p-theo'])).toEqual({ visibility: 'people', visibleTo: ['p-theo'] });
  });
  it('still adds to the people of a thread open to chosen people', () => {
    expect(openTo('people', ['p-lena'], ['p-theo'])).toEqual({ visibility: 'people', visibleTo: ['p-lena', 'p-theo'] });
  });
});

describe('Chosen people…', () => {
  it('narrows a Team thread to the one person picked', () => {
    expect(choose('team', ['p-old'], 'p-theo')).toEqual({ visibility: 'people', visibleTo: ['p-theo'] });
  });
  it('adds a person to the people already chosen, and takes one off again', () => {
    expect(choose('people', ['p-theo'], 'p-jun')).toEqual({ visibility: 'people', visibleTo: ['p-theo', 'p-jun'] });
    expect(choose('people', ['p-theo', 'p-jun'], 'p-theo')).toEqual({ visibility: 'people', visibleTo: ['p-jun'] });
  });
  it('is Only you once the last person is taken off', () => {
    expect(choose('people', ['p-theo'], 'p-theo')).toEqual({ visibility: 'private', visibleTo: [] });
  });
  it('opens a private thread to the one person picked', () => {
    expect(choose('private', [], 'p-theo')).toEqual({ visibility: 'people', visibleTo: ['p-theo'] });
  });
  it('lists the team with a tick on whoever can open it now', () => {
    const html = renderToStaticMarkup(React.createElement(ChooseList, { people: [{ id: 'p-theo', name: 'Theo Park' }, { id: 'p-jun', name: 'Jun Ito' }], chosen: ['p-jun'], onPick: () => {} }));
    expect(html).toContain('aria-label="Who can open it"');
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="true"[^>]*>.*Jun Ito/);
  });
  it('is what the row opens, in place of Add people', () => {
    const menu = fs.readFileSync(new URL('../renderer/src/threads/ThreadMenu.tsx', import.meta.url), 'utf8');
    expect(menu).toContain("if (to === 'people') { setSharing('choose'); return; }");
    expect(menu).not.toContain("if (to === 'people' && addPeople && onAddPeople) { setSharing(null); askToAdd(); return; }");
  });
});

describe('the window', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  it('copies through the fallback', () => {
    expect(app).toContain('if (await copyText(link)) return true;');
  });
  it('publishes the thread before its link is sent', () => {
    expect(app).toMatch(/await api\.teamSync\(\)\.catch\(\(\) => \{\}\);\n\s+const out = await api\.teamMessage\(/);
  });
  it('asks Share… and Send the same question the team list does', () => {
    expect(focus).toContain('const seen: SeenBy = seenNow(item, teamCtx.products.get(item.product), teamCtx.state.since ?? null);');
    expect(app).toContain('const seen = seenNow(item, team?.products.get(item.product), team?.state.since ?? null);');
  });
  it('syncs and waits for a linked thread it does not have yet, and opens it when it comes', () => {
    expect(app).toContain('linkWaiting.current = { personId, threadId };');
    expect(app).toMatch(/const w = linkWaiting\.current;\n\s+if \(!w\) return;\n\s+const card = weekCards\.find\(\(c\) => c\.personId === w\.personId && c\.threadId === w\.threadId\);/);
    expect(app).toContain("hasn't shared that thread with you.");
  });
});
