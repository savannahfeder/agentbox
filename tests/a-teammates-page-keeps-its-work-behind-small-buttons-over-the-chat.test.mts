// A TEAMMATE'S PAGE KEEPS ITS WORK BEHIND SMALL BUTTONS OVER THE CHAT (2026-11-12).
//
// The founder, on an AI teammate's page in Team: "you basically have the whole
// crazy prompt on the side. It's beyond overwhelming", and of every person's
// page, "I don't necessarily need to see everything they're doing immediately
// in the sidebar." Measured on a stand-in Security lead: a 272px column beside
// the chat held its whole job (about 40 lines) over Waiting on you, In progress
// and Finished this week. Of five drawn layouts the founder approved a row of
// small buttons over the chat (designs/w-3e7d2d1260/teammate-option-4.png):
// each names a list and its count and opens it over the chat; Job opens the job.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JobBlock, Place, listPart } from '../renderer/src/team/everything/PlacePage.tsx';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const app = read('renderer/src/App.tsx');
const css = read('renderer/src/team/everything/everything.css');
const JOB = 'I keep the app secure, following docs/security-checks.md. Daily: read the security scan since my last review.';
const mate = { key: 'mate:sec', kind: 'mate', name: 'Security lead', letter: 'S', agents: 0 };
const row = (key, title) => ({ key, title, word: '', at: 5_000 });

const html = renderToStaticMarkup(h(Place, {
  m: mate, about: 'AI teammate', chat: h('div', { className: 'chat-here' }, 'the chat'),
  parts: [
    ...listPart('Waiting on you', [row('a', 'Ship both fixes?')], 10_000, { ask: true }),
    ...listPart('In progress', [row('b', 'Check the pairing token')], 10_000),
    ...listPart('Done this week', [row('c', 'First audit'), row('d', 'Daily review')], 10_000),
    { key: 'job', label: 'Job', body: h(JobBlock, { job: JOB }) },
  ],
}));

describe("a teammate's page", () => {
  it('has no column beside the chat', () => {
    expect(html).not.toContain('pl-side');
    expect(html).toContain('the chat');
  });
  it('names each list with its count on a small button, in order', () => {
    const labels = [...html.matchAll(/<button type="button" class="pl-btn pl-chip[^"]*"[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    expect(labels).toEqual(['Waiting on you 1', 'In progress 1', 'Done this week 2', 'Job']);
  });
  it('marks only what waits on you with the dot', () => {
    expect(html.match(/class="pl-btn pl-chip ask"/g)).toHaveLength(1);
  });
  it('shows neither the job nor a list until one is pressed', () => {
    expect(html).not.toContain('docs/security-checks.md');
    expect(html).not.toContain('Check the pairing token');
    expect(html).not.toContain('pl-pop');
  });
});

describe('a list with nothing in it', () => {
  it('gets no button at all', () => {
    expect(listPart('In progress', [], 10_000)).toEqual([]);
  });
});

describe('App.tsx', () => {
  const places = app.slice(app.indexOf('if (placeMember && snap) {'), app.indexOf('// BACK LANDS ON THE TAB THE BAR NAMED'));
  it('gives every place its parts, and none a side', () => {
    expect(places).not.toMatch(/\bside=\{/);
    expect(places.match(/parts=\{\[/g)).toHaveLength(3);
  });
  it('says Done this week, as the approved picture does', () => {
    expect(places).toContain("listPart('Done this week'");
    expect(places).not.toContain('Finished this week');
  });
});

describe('the styles', () => {
  it('keep the chat to a readable width now the column is gone', () => {
    expect(css).toMatch(/\.pl-body \{[^}]*max-width: 900px/);
  });
  it('draw the list over the chat with rounded corners', () => {
    expect(css).toMatch(/\.pl-pop \{[^}]*position: absolute;[^}]*border-radius: var\(--artifact-corner\)/);
  });
  it('leave no rule for the old column', () => {
    expect(css).not.toContain('.pl-side');
  });
});
