// AN AI TEAMMATE'S PAGE IS A TASK BOX AND WHAT IT HAS ON (2026-11-13).
//
// Opening an AI teammate on the Team page showed a chat, and the founder found
// talking back and forth with it confusing: everything it says already lands in
// the inbox, so the page only needs to give it a task and show the tasks it has
// on, which is where they go looking for one they changed and lost. Measured by
// drawing the page's work view and reading what the app hands it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MateWork, Place } from '../renderer/src/team/everything/PlacePage.tsx';

const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const NOW = new Date(2026, 10, 12, 15, 0).getTime();
const row = (key: string, title: string, tone: 'ask' | 'work' | 'done', word = '') => ({ key, title, word, at: NOW - 3_600_000, tone });

describe('the work view', () => {
  const draw = (o: Partial<Parameters<typeof MateWork>[0]> = {}) => renderToStaticMarkup(React.createElement(MateWork, {
    name: 'Maintainer', now: NOW, onGive: async () => null,
    active: [row('a', 'Checkout test fails on Mondays', 'ask', 'Waiting on you'), row('b', 'Flaky upload test', 'work', 'Working')],
    done: [row('c', 'Bump the SDK', 'done')], ...o,
  }));
  it('opens on a box that gives it a task, by name', () => {
    expect(draw()).toContain('placeholder="Give Maintainer a task"');
  });
  it('lists what it has on, with what waits on you first, and counts them', () => {
    const html = draw();
    expect(html).toMatch(/Active<b>2<\/b>/);
    expect(html.indexOf('Checkout test fails on Mondays')).toBeLessThan(html.indexOf('Flaky upload test'));
    expect(html).toContain('pl-row ask');
  });
  it('keeps the week\'s finished work folded under one line', () => {
    const html = draw();
    expect(html).toMatch(/Done this week<b>1<\/b>/);
    expect(html).not.toContain('Bump the SDK');
  });
  it('says plainly when nothing is on, and draws no fold with nothing done', () => {
    const html = draw({ active: [], done: [] });
    expect(html).toContain('Nothing on right now.');
    expect(html).not.toContain('Done this week');
  });
  it('has no chat in it', () => {
    expect(draw()).not.toMatch(/Message Maintainer|tq-chat/);
  });
});

describe('the page around it', () => {
  it('names its first button for what it holds', () => {
    const m = { key: 'mate:t1', name: 'Maintainer', kind: 'mate', letter: 'M' } as unknown as Parameters<typeof Place>[0]['m'];
    const html = renderToStaticMarkup(React.createElement(Place, { m, chat: 'x', chatLabel: 'Tasks', parts: [{ key: 'about', label: 'About', body: 'Its job' }] }));
    expect(html).toMatch(/>Tasks<\/button>/);
    expect(html).not.toMatch(/>Chat<\/button>/);
  });
  it('a person\'s page still opens on the chat', () => {
    const m = { key: 'person:p1', name: 'Maya Chen', kind: 'person' } as unknown as Parameters<typeof Place>[0]['m'];
    const html = renderToStaticMarkup(React.createElement(Place, { m, chat: 'x', parts: [{ key: 'about', label: 'About', body: 'Bio' }] }));
    expect(html).toMatch(/>Chat<\/button>/);
  });
  it('the app gives the task as new work, never as an answer to its last question', () => {
    const app = read('renderer/src/App.tsx');
    const mate = app.slice(app.indexOf("placeMember.key.startsWith('mate:')"), app.indexOf('} else {', app.indexOf("placeMember.key.startsWith('mate:')")));
    expect(mate).toContain('chatLabel="Tasks"');
    expect(mate).toContain("api.teammates('post', { text, to: [id], fresh: true })");
    expect(mate).not.toContain('teammatesUi.chatWith(id)');
  });
  // Two testers saw a whole answer, or a usage-limit message, in place of each
  // task's name: the inbox names a teammate's thread by its last message.
  it('names each task by what it was asked to do, not by its last message', () => {
    const app = read('renderer/src/App.tsx');
    const mate = app.slice(app.indexOf("placeMember.key.startsWith('mate:')"), app.indexOf('} else {', app.indexOf("placeMember.key.startsWith('mate:')")));
    expect(mate).toMatch(/const taskRow = \(i: WorkItem, word: string, tone: PlaceRow\['tone'\]\): PlaceRow => \(\{ \.\.\.itemRow\(i, word, tone\), title: shownTitle\(i\) \}\);/);
    expect(mate).not.toMatch(/active=\{[^}]*itemRow\(/);
    expect(mate).not.toMatch(/done=\{[^}]*itemRow\(/);
  });
});
