// AN AI TEAMMATE PAUSES FROM THE DOTS IN THE CORNER, AND SHOWS ITS SETTINGS ON ITS PAGE (w-0773d2dee5).
//
// On an AI teammate's page in Team: "I don't know how to pause work on this
// agent", expecting "some dots in the top corner that allow me to change the
// configuration" and "some configuration for the agent here on this home
// page". The page had Tasks and About and nothing else. Pause lived only in
// the ⋯ of the old Chats page, which this page never draws, and the window's
// corner held the inbox's View and filters, which does nothing here. Measured
// on the built renderer with invented teammates: no Pause, Resume or ⋯ on the
// page, its About or its corner.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MateCorner, mateMenuRows } from '../renderer/src/teammates/MateCorner.tsx';
import { TeammateAbout, TeammateSettingsLine, scheduleWords } from '../renderer/src/teammates/TeammatesPage.tsx';
import { Place } from '../renderer/src/team/everything/PlacePage.tsx';
import type { Teammate } from '../renderer/src/types.ts';
globalThis.React = React;

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const app = read('renderer/src/App.tsx');
const mateBlock = app.slice(app.indexOf("placeMember.key.startsWith('mate:')"), app.indexOf('} else {', app.indexOf("placeMember.key.startsWith('mate:')")));

const mate = (o: Partial<Teammate> = {}): Teammate => ({
  id: 't-support', name: 'Support lead', letter: 'S', role: null, job: 'I answer the support inbox.', goal: null, counted: null, asksFirst: null,
  works: { every: 'weekday', at: '09:00' }, worksLabel: null, product: 'kestrel', engine: null, model: 'opus', effort: null, limit: 20,
  paused: false, status: 'active', memory: [], createdAt: 0, waiting: [], now: null, running: null, queued: 0, done: [], runsThisWeek: 6,
  duties: [], playbooks: [], ...o,
});
const products = [{ slug: 'kestrel', dir: '/x/kestrel', name: 'Kestrel' }, { slug: 'thicket', dir: '/x/thicket', name: 'Thicket' }] as unknown as Parameters<typeof TeammateSettingsLine>[0]['products'];
const line = (t: Teammate) => renderToStaticMarkup(h(TeammateSettingsLine, { t, products, onChanged: () => {} }));
const words = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the dots in the corner', () => {
  it('are a menu button named for the teammate', () => {
    const html = renderToStaticMarkup(h(MateCorner, { t: mate(), onSettings: () => {}, onChanged: () => {}, onDeleted: () => {} }));
    expect(html).toMatch(/<button type="button" class="ts-more" aria-label="Support lead options"[^>]*aria-haspopup="menu" aria-expanded="false"/);
  });
  it('offer Pause first, which pauses it', () => {
    expect(mateMenuRows(mate())[0]).toEqual({ id: 'pause', label: 'Pause', patch: { paused: true } });
  });
  it('offer Resume in its place once it is paused, and never both', () => {
    const rows = mateMenuRows(mate({ paused: true }));
    expect(rows[0]).toEqual({ id: 'resume', label: 'Resume', patch: { paused: false } });
    expect(rows.map((r) => r.label)).not.toContain('Pause');
  });
  it('offer Settings, which changes nothing by itself', () => {
    expect(mateMenuRows(mate()).find((r) => r.id === 'settings')).toEqual({ id: 'settings', label: 'Settings' });
  });
  it('offer Make primary only to an active teammate that is not primary yet', () => {
    expect(mateMenuRows(mate()).map((r) => r.label)).toEqual(['Pause', 'Settings', 'Make primary']);
    expect(mateMenuRows(mate({ primary: true })).map((r) => r.label)).toEqual(['Pause', 'Settings']);
    expect(mateMenuRows(mate({ status: 'draft' })).map((r) => r.label)).toEqual(['Pause', 'Settings']);
  });
  it('keep Delete last, under a line, asking first', () => {
    const src = read('renderer/src/teammates/MateCorner.tsx');
    expect(src).toMatch(/\{rows\.map\(row\)\}\s*<span className="sep" aria-hidden="true" \/>\s*\{row\(\{ id: 'delete', label: 'Delete', act: \(\) => setAsking\(true\) \}\)\}/);
    expect(src).toContain('<AskBeforeDeleting');
  });
});

describe('the corner of your AI teammate\'s page', () => {
  it('holds its dots where the inbox\'s View and filters stood', () => {
    expect(app).toContain('filters={!mateCorner && !roomShown && (!evOn || evKey === \'me\' || !!evBoardEl)}');
    expect(app).toContain('view={mateCorner ?? (roomShown ? roomsUi.viewButton : null)}');
  });
  it('gets them only on your own AI teammate, not a person or someone else\'s teammate', () => {
    expect(app.match(/mateCorner = /g)).toHaveLength(1);
    expect(mateBlock).toContain('mateCorner = teammatesUi.cornerOf(id, {');
  });
  it('opens About at its settings from Settings', () => {
    expect(mateBlock).toContain("onSettings: () => { setAboutAtSettings(true); setPlaceView({ of: mateKey, key: 'about' }); },");
    expect(mateBlock).toContain("body: teammatesUi.aboutOf(id, { atSettings: aboutAtSettings })");
  });
});

describe('the settings line over its tasks', () => {
  it('says when it works on its own, where, and on what model, in that order', () => {
    const said = words(line(mate()));
    expect(said).toMatch(/^Schedule Weekdays at 9:00\s?am Works in Kestrel Model /i);
  });
  it('says Paused with a Resume button when it is paused, and no schedule to change', () => {
    const html = line(mate({ paused: true }));
    expect(words(html)).toMatch(/^Schedule Paused Resume Works in Kestrel/);
    expect(html).toContain('<button type="button" class="pl-btn tq-set-btn">Resume</button>');
    expect(html).not.toContain('aria-label="Schedule"');
  });
  it('leaves the schedule out while it is still being set up', () => {
    expect(words(line(mate({ status: 'draft' })))).toMatch(/^Works in Kestrel Model /);
  });
  it('is drawn under the name and over the tabs, on your AI teammate\'s page only', () => {
    const m = { key: 'mate:t-support', name: 'Support lead', kind: 'mate', letter: 'S' } as unknown as Parameters<typeof Place>[0]['m'];
    const html = renderToStaticMarkup(h(Place, { m, chat: 'x', chatLabel: 'Tasks', under: h('i', { className: 'the-line' }), parts: [{ key: 'about', label: 'About', body: 'b' }] }));
    expect(html.indexOf('pl-head')).toBeLessThan(html.indexOf('the-line'));
    expect(html.indexOf('the-line')).toBeLessThan(html.indexOf('pl-parts'));
    expect(renderToStaticMarkup(h(Place, { m, chat: 'x' }))).not.toContain('pl-under');
    expect(mateBlock).toContain('under={teammatesUi.settingsOf(id)}');
    expect(app.match(/under=\{/g)).toHaveLength(1);
  });
});

describe('the schedule in words', () => {
  it('reads its own schedule', () => {
    expect(scheduleWords(mate())).toMatch(/^Weekdays at 9:00\s?am$/i);
  });
  it('says None when nothing wakes it', () => {
    expect(scheduleWords(mate({ works: null }))).toBe('None');
  });
  it('reads each of two duties, and the first of more with how many besides', () => {
    const d = (id: string, when: string) => ({ id, what: 'Read the inbox', when });
    expect(scheduleWords(mate({ duties: [d('d-1', 'Daily at 9:00am')] }))).toBe('Daily at 9:00am');
    expect(scheduleWords(mate({ duties: [d('d-1', 'Daily at 9:00am'), d('d-2', 'After a ship')] }))).toBe('Daily at 9:00am and after a ship');
    expect(scheduleWords(mate({ duties: [d('d-1', 'Daily at 9:00am'), d('d-2', 'After a ship'), d('d-3', 'Mondays at 8:00am')] }))).toBe('Daily at 9:00am and 2 more');
  });
});

describe('About on its page', () => {
  const about = (t: Teammate) => words(renderToStaticMarkup(h(TeammateAbout, { t, view: null, products, engines: [], onOpen: () => {}, onChanged: () => {} })));
  it('does not repeat what the line over it says', () => {
    const said = about(mate());
    expect(said).not.toMatch(/On its own|Works in|Model/);
  });
  it('keeps the rest of its settings', () => {
    expect(about(mate())).toMatch(/Settings Name\b.*\bFace\b.*\bCan read\b.*\bYour team\b.*\bThis week 6 of 20 runs/);
  });
});

describe('Escape', () => {
  it('closes an open menu or picker before it leaves About', () => {
    expect(read('renderer/src/team/everything/PlacePage.tsx')).toContain("document.querySelector('.th-menu, .prio-menu')");
  });
});
