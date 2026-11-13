// A TASK HANDED ON LEADS BACK TO THE THREAD IT CAME FROM (2026-11-12).
//
// A hand-off makes a task whose body starts with the thread's name as a link
// (shared/thread-link sentWords). Two testers in two rounds opened such a
// task, read the summary and the file links, and asked where the original
// conversation was; neither read the first line as the way in. The task now
// says so under its header, as a thread carried on from a teammate's does
// ("Continued from Theo's thread"), with the same button.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { handedFrom, sentWords, threadLink } from '../shared/thread-link.mts';
import { HandedFrom, OpenTeammateThread } from '../renderer/src/threads/ContinuedFrom.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';

const link = threadLink('u-theo', 't-1')!;
const task = (over = {}) => ({
  id: 'w-1', product: 'dm-theo', status: 'open', kind: 'task', title: 'Fix the pricing page', priority: 5, createdAt: 1, updatedAt: 1,
  createdBy: 'u-theo', assignee: 'u-lena', people: ['u-theo', 'u-lena'], body: sentWords('Fix the pricing page', link, 'The tests are red since Tuesday.'), ...over,
});

describe('handedFrom', () => {
  it('reads the thread a hand-off names, when the giver owns it', () => {
    expect(handedFrom(task().body, 'u-theo')).toEqual({ owner: 'u-theo', id: 't-1' });
  });
  it('is nothing for a link to someone else\'s thread, a task with no link, or a link later in the words', () => {
    expect(handedFrom(task().body, 'u-maya')).toBeNull();
    expect(handedFrom('Fix the pricing page\n\nThe tests are red.', 'u-theo')).toBeNull();
    expect(handedFrom(`Please read\n\n[Fix the pricing page](${link})`, 'u-theo')).toBeNull();
    expect(handedFrom(null, 'u-theo')).toBeNull();
    expect(handedFrom(task().body, null)).toBeNull();
  });
  it('reads a title that had brackets in it', () => {
    expect(handedFrom(sentWords('[WIP] Fix the [pricing] page', link, ''), 'u-theo')).toEqual({ owner: 'u-theo', id: 't-1' });
  });
});

describe('the line on the task', () => {
  const team = { me: 'u-lena', state: {}, byId: new Map([['u-theo', { id: 'u-theo', name: 'Theo Okafor', email: '', avatarUrl: null }]]), products: new Map() };
  const draw = (item, open = () => {}) => renderToStaticMarkup(h(TeamContext.Provider, { value: team }, h(OpenTeammateThread.Provider, { value: open }, h(HandedFrom, { item }))));

  it('names whose thread it came from, as a button that opens it', () => {
    const html = draw(task());
    expect(html).toContain('Handed on from');
    expect(html).toContain("<button type=\"button\">Theo&#x27;s thread</button>");
  });
  it('is nothing on the giver\'s side, or on a task typed by hand', () => {
    expect(draw(task({ assignee: 'u-theo', createdBy: 'u-lena', people: ['u-lena', 'u-theo'] }))).toBe('');
    expect(draw(task({ body: 'Fix the pricing page\n\nThe tests are red.' }))).toBe('');
  });
});

describe('the thread page', () => {
  it('draws the line under a given task\'s header', () => {
    const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(focus).toContain('{givenTask && <HandedFrom item={item} />}');
  });
  it('the person page reads the hand-off with the same rule', () => {
    const timeline = fs.readFileSync(new URL('../renderer/src/team/pair-timeline.ts', import.meta.url), 'utf8');
    expect(timeline).toContain('handedFrom(t.body, giver)');
    expect(timeline).not.toMatch(/\^\\\[\[\^\\\]\]\*\\\]/);
  });
});
