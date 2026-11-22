// HOME'S BOX ON A TEAM SHOWS WHAT YOU HAVE NOT CHANGED AS A MARK.
//
// "This task creation page on multiplayer is pretty messy" (2026-11-21, with a
// screenshot of Home's box addressed to a person). Measured in the demo team at
// 1512 by 982: one row held the To chip, a dashed plus, a square Message/Task
// toggle, a square subject field whose hint was cut to "Subject, for a thread of
// its c", Agent decides, the paperclip and Send. On a task the row ran out of
// room and hid the paperclip. Of five layouts drawn in the real app, "quiet
// marks" was approved: who and what kind stay on the left as they are, and a
// control nobody changed is its mark alone on the right, with its word kept for
// screen readers, until it is changed. The pop-up keeps its labelled rows and
// takes the same rounded toggle and plain plus.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import React, { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const ME = 'p-maya', DEV = 'p-dev', LENA = 'p-lena';
// Three people, so a message has somebody left to add.
const people = [{ id: ME, name: 'Maya Chen' }, { id: DEV, name: 'Dev Rao' }, { id: LENA, name: 'Lena Ortiz' }];
const team = { me: ME, state: { signedIn: true, people, cards: [] }, byId: new Map(people.map((p) => [p.id, p])), products: new Map() };

beforeAll(() => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
});

type Props = Record<string, unknown>;
const draw = async (props: Props, withTeam = true) => {
  const { ThreadComposer } = await import('../renderer/src/threads/ThreadComposer.tsx');
  const box = h(ThreadComposer, {
    products: [{ slug: 'p', name: 'Ferry', dir: '/p', repoPath: '/r' }], items: [], engines: ['claude'],
    codexModels: [], codexModelDefault: null, onClose() {}, onSent() {},
    blockChoicesFor: () => [{ id: 'w-9', label: 'Fix the double booking' }],
    ...props,
  });
  return renderToStaticMarkup(withTeam ? h(TeamContext.Provider, { value: team }, box) : box);
};
// The row of controls under the words.
const barOf = (html: string) => html.slice(html.indexOf('class="tc-bar'));
// Where each thing sits in the row, so the order can be read off.
const at = (bar: string, re: RegExp) => { const m = bar.search(re); expect(m, String(re)).toBeGreaterThan(-1); return m; };
const atRest = (bar: string, title: string) => new RegExp(`class="tc-chip[^"]*tc-at-rest[^"]*"[^>]*title="${title}`).test(bar)
  || new RegExp(`title="${title}[^"]*"[^>]*class="tc-chip[^"]*tc-at-rest`).test(bar);

describe('a message to a person, on Home with a team', () => {
  it('keeps who and what kind on the left and puts the marks after a gap', async () => {
    const html = await draw({ inline: true, initial: { to: DEV } });
    expect(html).toMatch(/class="tc-card tc-inline tc-quiet"/);
    const bar = barOf(html);
    const who = at(bar, /Dev Rao/), add = at(bar, /aria-label="Add someone"/), kind = at(bar, /class="tc-seg"/);
    const gap = at(bar, /class="tc-gap"/), subject = at(bar, /tc-subject-chip/), level = at(bar, /title="Priority/);
    const clip = at(bar, /aria-label="Attach files"/), send = at(bar, /class="tc-send-main"/);
    expect([who, add, kind, gap, subject, level, clip, send]).toEqual([...[who, add, kind, gap, subject, level, clip, send]].sort((a, b) => a - b));
  });

  it('draws the subject and the level as marks, with their words kept for screen readers', async () => {
    const bar = barOf(await draw({ inline: true, initial: { to: DEV } }));
    expect(bar).toMatch(/class="tc-chip tc-subject-chip tc-at-rest"/);
    expect(bar).toMatch(/placeholder="Subject"/);
    expect(atRest(bar, 'Priority')).toBe(true);
    expect(bar).toMatch(/<span class="tc-chip-text">Agent decides<\/span>/);
  });

  it('no longer has a subject field whose hint runs out of room', async () => {
    const html = await draw({ inline: true, initial: { to: DEV } });
    expect(html).not.toMatch(/Subject, for a thread of its own/);
  });

  it('shows a subject once there is one', async () => {
    const bar = barOf(await draw({ inline: true, initial: { to: DEV, subject: 'Launch film shot list' } }));
    expect(bar).toMatch(/class="tc-chip tc-subject-chip"/);
    expect(bar).toMatch(/value="Launch film shot list"/);
  });
});

describe('a task for a person, on Home with a team', () => {
  it('draws its day, what it waits on, who sees it and the level as marks, in that order', async () => {
    const bar = barOf(await draw({ inline: true, initial: { to: DEV, sendAs: 'task' } }));
    expect(atRest(bar, 'Due On')).toBe(true);
    expect(atRest(bar, 'Blocked By')).toBe(true);
    expect(atRest(bar, 'Who sees it')).toBe(true);
    expect(atRest(bar, 'Priority')).toBe(true);
    const gap = at(bar, /class="tc-gap"/), due = at(bar, /title="Due On"/), blocked = at(bar, /title="Blocked By"/);
    const sees = at(bar, /title="Who sees it"/), level = at(bar, /title="Priority/), clip = at(bar, /aria-label="Attach files"/);
    expect([gap, due, blocked, sees, level, clip]).toEqual([gap, due, blocked, sees, level, clip].sort((a, b) => a - b));
    // The words a person picked out of ten are still what a screen reader says.
    expect(bar).toMatch(/>No Deadline</);
    expect(bar).toMatch(/>Not blocked</);
  });

  it('offers no second person, since a task goes to one', async () => {
    const bar = barOf(await draw({ inline: true, initial: { to: DEV, sendAs: 'task' } }));
    expect(bar).not.toMatch(/aria-label="Add someone"/);
  });

  it('shows a word once it is changed, and only that one', async () => {
    const bar = barOf(await draw({ inline: true, initial: { to: DEV, sendAs: 'task', due: '2026-11-27', visibility: 'private' } }));
    expect(atRest(bar, 'Due On')).toBe(false);
    expect(atRest(bar, 'Who sees it')).toBe(false);
    expect(atRest(bar, 'Blocked By')).toBe(true);
    expect(atRest(bar, 'Priority')).toBe(true);
  });
});

describe('a task for an agent, on Home with a team', () => {
  it('keeps the model and project as words and puts who sees it before the level', async () => {
    const bar = barOf(await draw({ inline: true }));
    const model = at(bar, /Opus|Sonnet|Claude/), project = at(bar, /data-tour="project"/), gap = at(bar, /class="tc-gap"/);
    const sees = at(bar, /title="Who sees it"/), level = at(bar, /title="Priority/), send = at(bar, /class="tc-send-caret/);
    expect([model, project, gap, sees, level, send]).toEqual([model, project, gap, sees, level, send].sort((a, b) => a - b));
    expect(atRest(bar, 'Who sees it')).toBe(true);
    expect(atRest(bar, 'Priority')).toBe(true);
  });
});

describe('what must not change', () => {
  it('the pop-up keeps its labelled rows and its words', async () => {
    const html = await draw({ initial: { to: DEV } });
    expect(html).not.toMatch(/tc-quiet/);
    expect(html).not.toMatch(/class="tc-gap"/);
    expect(html).toMatch(/<span class="tc-label">Subject<\/span>/);
    expect(html).toMatch(/placeholder="Name the work to give it a thread of its own"/);
  });

  it('Home without a team keeps its row of words', async () => {
    const html = await draw({ inline: true }, false);
    expect(html).not.toMatch(/tc-quiet/);
    expect(html).not.toMatch(/class="tc-gap"/);
  });

  it('an AI teammate in To keeps its own bar', async () => {
    const html = await draw({
      inline: true, initial: { mate: 't-ada' },
      agentMates: [{ id: 't-ada', name: 'Ada', letter: 'A', role: null }], onToTeammate: async () => null,
    });
    expect(html).not.toMatch(/tc-quiet/);
  });
});

describe('the styles', () => {
  const css = fs.readFileSync(new URL('../renderer/src/threads/thread-composer.css', import.meta.url), 'utf8');
  const rule = (sel: string) => {
    const at = css.indexOf(`${sel} {`);
    expect(at, sel).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  };

  it('draws a mark at rest as its icon alone, 28px and borderless, with the word kept but unseen', () => {
    expect(rule('.tc-quiet .tc-chip.tc-at-rest')).toMatch(/width: 28px/);
    expect(rule('.tc-quiet .tc-chip.tc-at-rest')).toMatch(/border-color: transparent/);
    const word = rule('.tc-quiet .tc-chip.tc-at-rest .tc-chip-text');
    expect(word).toMatch(/clip-path: inset\(50%\)/);
    expect(word).not.toMatch(/display: none/);
  });

  // Measured in the demo team: the level's menu opened rightward from a mark at
  // the row's right end, widened the row past its box, and the row then hid
  // that very mark, menu and all (fit-row.ts reads the row's scroll width).
  it('opens a mark\'s menu leftward from its right edge, so an open menu never widens the row', () => {
    const open = rule('.tc-quiet .tc-bar > .tc-gap ~ .tc-anchor > .tc-menu');
    expect(open).toMatch(/left: auto/);
    expect(open).toMatch(/right: 0/);
  });

  it('rounds the toggle and clips its lit half to the corners, in the pop-up as on Home', () => {
    const seg = rule('.tc-seg');
    expect(seg).toMatch(/border: 1px solid var\(--line\)/);
    expect(seg).toMatch(/border-radius: var\(--tag-radius\)/);
    expect(seg).toMatch(/overflow: hidden/);
  });

  it('draws the plus as a plain button, not a dashed one', () => {
    const add = rule('.tc-add');
    expect(add).toMatch(/border: 1px solid var\(--line\)/);
    expect(add).toMatch(/border-radius: var\(--tag-radius\)/);
    expect(css).not.toMatch(/\.tc-add[^{]*\{[^}]*dashed/);
  });

  it('leaves nothing of the four layouts that were not picked', () => {
    expect(css).not.toMatch(/tc-lay|tc-give|tc-tabs|tc-top/);
    const src = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/tc-home-layout|readHomeLayout|kindTabs|giveMenu|layoutHead/);
  });
});
