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
//
// Of the five designs, the settings in a column beside the tasks was kept,
// with three notes on its picture: the dropdowns should read as tags, a Pause
// button of its own "doesn't make the most sense", and "oftentimes the job
// gets really long", so it is cut short with an ellipsis.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MateCorner, mateMenuRows } from '../renderer/src/teammates/MateCorner.tsx';
import { TeammateAbout, TeammateSettingsColumn, scheduleWords } from '../renderer/src/teammates/TeammatesPage.tsx';
import { Place } from '../renderer/src/team/everything/PlacePage.tsx';
import type { Teammate } from '../renderer/src/types.ts';
globalThis.React = React;

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const app = read('renderer/src/App.tsx');
const css = read('renderer/src/teammates/teammates.css');
const placeCss = read('renderer/src/team/everything/everything.css');
const rule = (text: string, sel: string) => {
  const at = text.indexOf(`\n${sel} {`);
  return at < 0 ? '' : text.slice(at, text.indexOf('}', at));
};
const mateBlock = app.slice(app.indexOf("placeMember.key.startsWith('mate:')"), app.indexOf('} else {', app.indexOf("placeMember.key.startsWith('mate:')")));

const mate = (o: Partial<Teammate> = {}): Teammate => ({
  id: 't-support', name: 'Support lead', letter: 'S', role: null, job: 'I answer the support inbox.', goal: null, counted: null, asksFirst: null,
  works: { every: 'weekday', at: '09:00' }, worksLabel: null, product: 'kestrel', engine: null, model: 'opus', effort: null, limit: 20,
  paused: false, status: 'active', memory: [], createdAt: 0, waiting: [], now: null, running: null, queued: 0, done: [], runsThisWeek: 6,
  duties: [], playbooks: [], ...o,
});
const products = [{ slug: 'kestrel', dir: '/x/kestrel', name: 'Kestrel' }, { slug: 'thicket', dir: '/x/thicket', name: 'Thicket' }] as unknown as Parameters<typeof TeammateSettingsColumn>[0]['products'];
const column = (t: Teammate) => renderToStaticMarkup(h(TeammateSettingsColumn, { t, products, onChanged: () => {}, onJob: () => {} }));
const LONG_JOB = 'I find posts on X where people talk about coding agents. Each weekday at 9am I draft a short, honest reply from your account for you to check, and I never post without your yes. I keep a list of who replied back and what worked, and I tell you every Friday.';
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

describe('the settings beside its tasks', () => {
  it('say whether it is working, when, where, on what model, this week\'s runs and its job, in that order', () => {
    expect(words(column(mate()))).toMatch(/^Status Active Schedule Weekdays at 9:00\s?am Works in Kestrel Model .+ This week 6 of 20 runs Job I answer the support inbox\.$/i);
  });
  it('pause it from a Status tag that says Paused, with no Pause button of its own', () => {
    expect(column(mate())).toMatch(/aria-label="Status"[^>]*>Active<\/button>/);
    const paused = column(mate({ paused: true }));
    expect(paused).toMatch(/aria-label="Status"[^>]*>Paused<\/button>/);
    expect(words(paused)).not.toMatch(/\b(Pause|Resume)\b/);
    expect(read('renderer/src/teammates/TeammatesPage.tsx')).toContain("onPick={(id) => keep({ paused: id === 'paused' })}");
  });
  it('leave Status and the schedule out while it is still being set up', () => {
    expect(words(column(mate({ status: 'draft' })))).toMatch(/^Works in Kestrel Model /);
  });
  it('draw every value you can change as a tag, not as an underlined word with a chevron', () => {
    const tag = rule(css, '.tq-set-col .compose-word');
    expect(tag).toMatch(/border: 1px solid var\(--line\)/);
    expect(tag).toMatch(/border-radius: var\(--tag-radius\)/);
    expect(tag).toMatch(/text-decoration: none/);
    expect(css).not.toMatch(/tq-set-col[^{}]*::after/);
    expect(css).not.toContain('tq-set-line');
  });
  it('cut a long job to three lines with an ellipsis, keep it whole on hover, and open About when pressed', () => {
    const html = column(mate({ job: LONG_JOB }));
    expect(html).toContain(`<button type="button" class="tq-set-job" title="${LONG_JOB}">${LONG_JOB}</button>`);
    const job = rule(css, '.tq-set-job');
    expect(job).toMatch(/-webkit-line-clamp: 3/);
    expect(job).toMatch(/-webkit-box-orient: vertical/);
    expect(job).toMatch(/overflow: hidden/);
    expect(mateBlock).toContain("onJob: () => { setAboutAtSettings(false); setPlaceView({ of: mateKey, key: 'about' }); },");
  });
  it('leave the job out when it has none', () => {
    expect(words(column(mate({ job: null })))).not.toMatch(/\bJob\b/);
  });
  it('stand beside its tasks on the Tasks view, and not over About', () => {
    const m = { key: 'mate:t-support', name: 'Support lead', kind: 'mate', letter: 'S' } as unknown as Parameters<typeof Place>[0]['m'];
    const parts = [{ key: 'about', label: 'About', body: 'b' }];
    const tasks = renderToStaticMarkup(h(Place, { m, chat: h('i', { className: 'the-tasks' }), chatLabel: 'Tasks', side: h('i', { className: 'the-side' }), parts }));
    expect(tasks.indexOf('the-tasks')).toBeLessThan(tasks.indexOf('the-side'));
    expect(tasks).toMatch(/<aside class="pl-side"[^>]*><i class="the-side"><\/i><\/aside>/);
    const about = renderToStaticMarkup(h(Place, { m, chat: 'x', chatLabel: 'Tasks', side: h('i', { className: 'the-side' }), parts, view: { of: m.key, key: 'about' }, onView: () => {} }));
    expect(about).not.toContain('the-side');
    expect(renderToStaticMarkup(h(Place, { m, chat: 'x' }))).not.toContain('pl-side');
  });
  it('step aside when the page is too narrow for two columns, where the dots in the corner still pause it', () => {
    expect(rule(placeCss, '.pl-main')).toMatch(/container-type: inline-size/);
    expect(placeCss).toMatch(/@container \(max-width: \d+px\) \{ \.pl-side \{ display: none; \} \}/);
  });
  it('are passed on your own AI teammate\'s page only', () => {
    expect(mateBlock).toContain('side={teammatesUi.settingsOf(id, {');
    expect(app.match(/side=\{teammatesUi/g)).toHaveLength(1);
    expect(app).not.toMatch(/under=\{/);
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
  it('keeps the settings the column shows too, since the column steps aside for it', () => {
    expect(about(mate())).toMatch(/\bOn its own\b.*\bModel\b.*\bWorks in\b/);
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
