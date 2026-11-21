// THE TEAM PAGES SHOW ONE OF EACH CONTROL, AT ONE SIZE.
//
// What was wrong, read off screenshots of the Standup, a person's page and a
// group's chat, then checked in the code:
// - With no AI teammates, the list offered New teammate twice: a "+" on the
//   heading and a dashed row under it.
// - The list's search carried a lone mono "G" key cap the app's own search has not.
// - Every section showed its count, so "People 1" and "Groups 1".
// - The team's group row said "Your team", the member panel's own heading.
// - The Standup's one row of controls came in four heights (28, 30, 30, 32), its
//   back arrow was 16px and its forward arrow 12px with another path, and the
//   back arrow sat about 9px right of the day's title.
// - A person's Give a task was 30px, 13px, radius 8px and had no icon, under a
//   New thread of 32px, 13.5px, var(--radius) with one.
// - That page's header ran full width while its chat stopped at 900px, and the
//   chat's box kept 32px off the right, so the box and Give a task did not line up.
// - The member panel's faces were 32px, against 20 in the list and 28 in messages.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
const chats = read('renderer/src/teammates/ChatsColumn.tsx');
const teammatesCss = read('renderer/src/teammates/teammates.css');
const standup = read('renderer/src/team/StandupPage.tsx');
const standupCss = read('renderer/src/team/standup.css');
const icons = read('renderer/src/team/rooms/icons.tsx');
const place = read('renderer/src/team/everything/PlacePage.tsx');
const everything = read('renderer/src/team/everything/everything.css');
const group = read('renderer/src/team/rooms/GroupPage.tsx');
const rule = (css: string, sel: string) => {
  const at = css.indexOf(`\n${sel} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};
const height = (css: string, sel: string) => rule(css, sel).match(/[\s;{]height: (\d+)px/)?.[1];

describe('the team list', () => {
  it('offers New teammate once: the row while there are none, the heading "+" once there are', () => {
    expect(chats).toMatch(/!c\.teammates\.length && <button[^>]*cx-add/);
    expect(chats).toMatch(/c\.teammates\.length > 0 && <button[^>]*cx-plus/);
  });

  it('has no key cap in its search', () => {
    const search = chats.match(/<label className="cx-search">[\s\S]*?<\/label>/)?.[0] ?? '';
    expect(search).toContain('<input');
    expect(search).not.toContain('<kbd');
    expect(teammatesCss).not.toMatch(/\.cx-search kbd/);
  });

  it('shows a section count only from 2', () => {
    expect(chats).toMatch(/count > 1 && <em>\{count\}<\/em>/);
    expect(chats).not.toMatch(/count > 0 && <em>/);
  });

  it('does not tag the team group "Your team"', () => {
    expect(chats).toMatch(/!g\.team && groupTag\(g\)/);
  });
});

describe('the Standup controls', () => {
  it('are all 30px tall', () => {
    for (const sel of ['.su-tog', '.su-icon', '.su-ar', '.su-day', '.su-search']) expect(height(standupCss, sel), sel).toBe('30');
  });

  it('draw the two week arrows at one size and stroke, mirrored', () => {
    expect(icons).toMatch(/back: \(\) => svg\('<path d="M15 6l-6 6 6 6"\/>', 16, 1\.6\)/);
    expect(icons).toMatch(/forward: \(\) => svg\('<path d="M9 6l6 6-6 6"\/>', 16, 1\.6\)/);
    expect(standup).toMatch(/aria-label="The week after".*>\{I\.forward\(\)\}<\/button>/);
  });

  it('pull the back arrow left so its point lines up with the day title', () => {
    expect(rule(standupCss, '.su-ar:first-child')).toMatch(/margin-left: -11px/);
  });
});

describe("a person's page", () => {
  it('gives its header action an icon and the New thread look', () => {
    const action = place.match(/export function PlaceAction[\s\S]*?\n}\n/)?.[0] ?? '';
    expect(action).toMatch(/pl-btn pl-act/);
    expect(action).toMatch(/!quiet && PLUS/);
    expect(place).toMatch(/const PLUS = <svg width="14" height="14"/);
    const act = rule(everything, '.pl-act');
    expect(act).toMatch(/height: 32px/);
    expect(act).toMatch(/border-radius: var\(--radius\)/);
    expect(act).toMatch(/font-size: 13\.5px/);
  });

  it('keeps its header and its chat to one width, with the chat box out to that edge', () => {
    expect(rule(everything, '.pl-head')).toMatch(/max-width: 900px/);
    expect(rule(everything, '.pl-body')).toMatch(/max-width: 900px/);
    expect(rule(everything, '.pl-chat .gr-chat .rm-full .rm-compose')).toMatch(/margin-right: 0/);
    expect(rule(everything, '.pl-send > .rm-compose:not(.tq-compose)')).toMatch(/margin: 8px 0 24px/);
  });
});

describe("a group's member panel", () => {
  it('draws faces at 28px, as messages do', () => {
    expect(group).toMatch(/<Face name=\{c\.name\} url=\{c\.avatarUrl\} size=\{28\} \/>/);
    expect(rule(teammatesCss, '.gr-side .gr-prow')).toMatch(/grid-template-columns: 28px/);
  });
});
