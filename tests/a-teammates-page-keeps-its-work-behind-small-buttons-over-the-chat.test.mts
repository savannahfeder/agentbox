// A TEAMMATE'S PAGE KEEPS ITS WORK BEHIND SMALL BUTTONS OVER THE CHAT (2026-11-12).
//
// The founder, on an AI teammate's page in Team: "you basically have the whole
// crazy prompt on the side. It's beyond overwhelming", and of every person's
// page, "I don't necessarily need to see everything they're doing immediately
// in the sidebar." Measured on a stand-in Security lead: a 272px column beside
// the chat held its whole job (about 40 lines) over Waiting on you, In progress
// and Finished this week. Of five drawn layouts the founder approved a row of
// small buttons over the chat (designs/w-3e7d2d1260/teammate-option-4.png).
// Built first as dropdowns over the chat, which the founder read as wrong: "I
// assumed those were things I could click into, and it would show me that
// content". So each shows its list, or the job, in the chat's place, and Chat,
// first and lit, brings the chat back. Then: "job should basically be an about
// page that you can use to get info about an agent and edit it", so Job became
// About, the teammate sheet's rows (job, voice, schedule, model and the rest)
// drawn in the page with the whole job, and Settings left the header.
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
    { key: 'about', label: 'About', body: h(JobBlock, { job: JOB }) },
  ],
}));

describe("a teammate's page", () => {
  it('has no column beside the chat', () => {
    expect(html).not.toContain('pl-side');
    expect(html).toContain('the chat');
  });
  it('names each list with its count on a small button, in order', () => {
    const labels = [...html.matchAll(/<button [^>]*class="pl-btn pl-chip[^"]*"[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    expect(labels).toEqual(['Chat', 'Waiting on you 1', 'In progress 1', 'Done this week 2', 'About']);
  });
  it('marks only what waits on you with the dot', () => {
    expect(html.match(/class="pl-btn pl-chip ask"/g)).toHaveLength(1);
  });
  it('opens on the chat, with Chat lit', () => {
    expect(html).toMatch(/role="tab" aria-selected="true" class="pl-btn pl-chip">Chat</);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
  });
  it('shows neither the job nor a list until one is pressed', () => {
    expect(html).not.toContain('docs/security-checks.md');
    expect(html).not.toContain('Check the pairing token');
    expect(html).not.toContain('pl-view');
    expect(html).not.toContain('pl-chat away');
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
  it('gives your AI teammate an About that reads and changes it, and no Settings button', () => {
    expect(places).toContain("{ key: 'about', label: 'About', body: teammatesUi.aboutOf(id) }");
    expect(places).not.toContain('>Settings</PlaceAction>');
    expect(places).not.toContain("label: 'Job'");
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
  it('put a list in the chat\'s place, keeping the chat mounted so a draft survives', () => {
    expect(css).toContain('.pl-chat.away { display: none; }');
    expect(css).toMatch(/\.pl-view \{[^}]*overflow-y: auto/);
    expect(css).not.toContain('.pl-pop');
  });
  it('leave no rule for the old column', () => {
    expect(css).not.toContain('.pl-side');
  });
});

describe("an AI teammate's About", () => {
  const page = read('renderer/src/teammates/TeammatesPage.tsx');
  it('draws the same rows as the About sheet, from one place', () => {
    expect(page).toMatch(/function Details\(props: AboutProps\) \{[^]*?<AboutFields \{\.\.\.props\} \/>/);
    expect(page).toMatch(/export function TeammateAbout\([^]*?<AboutFields \{\.\.\.props\} models=\{models\} call=\{call\} whole \/>/);
  });
  it('shows the whole job on the page and every setting open, where the sheet clips and folds them', () => {
    expect(page).toContain('shown={job && !whole ? clipLine(firstSentence(job), 150) : job}');
    expect(page).toContain('{whole ? <><h4 className="tq-about-h">Settings</h4>{settings}</>');
  });
});
