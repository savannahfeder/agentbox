// THE SIDEBAR ENDS AT SETTINGS WHEN THERE IS NOBODY TO SHOW (w-b59cbe3154,
// 2026-10-05).
//
// Testing the app as a brand-new person she photographed the bottom-left
// corner: "There's just this empty space in the bottom-left corner because it
// doesn't have data on the user, so we need to figure out how to make that
// visually appealing."
//
// What was down there: `.th-me`, your own row, which with a team is your face,
// name and email opening your account menu. With nobody signed in and no team
// cloud it fell through to `<span />`, and `.th-me` itself carries
// `height: 46px; margin-top: 8px; border-top: 1px solid var(--line)`, so the
// empty case still drew its hairline and its 46 points of nothing. Measured
// headless on the built renderer at 1512x945: 202 x 46, innerText "".
//
// Five things that could sit there were drawn; she picked nothing at all. Then
// three rounds on the one number left, the air under Settings. As built it was
// 66 (12 utilities padding + 8 margin + 46 box). Taking the box out and
// changing nothing else leaves 12, and her words on that: "no i meant there was
// too much space. 12 px was too much." Shown 0, 4 and 8, she picked 4.
//
// So this pins both halves: the row is not drawn at all when there is nobody
// in it, rather than drawn empty or hidden with :empty, and the foot sits 4
// points off the bottom in exactly that case while a team's row keeps its 12.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import postcss from 'postcss';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nav = postcss.parse(fs.readFileSync(path.join(root, 'renderer/src/workspace-navigation.css'), 'utf8'));

const noop = () => {};
const draw = (extra = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
  view: 'inbox', collapsed: false, onToggle: noop, onView: noop, onSearch: noop, onCompose: noop,
  onFeedback: noop, onInstructions: noop, onSettings: noop, ...extra,
}));

// A made-up person on a made-up team. Nothing here is anyone's real details.
const me = { id: 'u-1', email: 'ada@example.test', name: 'Ada Lovelace', avatarUrl: null };
const onATeam = { configured: true, signedIn: true, me, team: { id: 't-1', name: 'Northwind' }, people: [me], cards: [], lastSyncAt: null, error: null };
const signedOut = { ...onATeam, signedIn: false, me: null, team: null };

// The last value each property gets in rules with exactly this selector.
function declsOf(css, selector) {
  const out = {};
  css.walkRules((rule) => {
    if (rule.selectors.includes(selector)) rule.walkDecls((d) => { out[d.prop] = d.value; });
  });
  return out;
}
const px = (v) => (v == null ? undefined : Number.parseFloat(v));

describe('the bottom-left corner on a Mac with nobody in it', () => {
  it.each([
    ['there is no team cloud at all', null],
    ['the team cloud is set up but nothing opens sign in', signedOut],
  ])('draws no row at all, so there is no hairline, when %s', (_, team) => {
    for (const collapsed of [false, true]) {
      const html = draw({ team, collapsed });
      expect(html).not.toContain('class="th-me"');
      expect(html).toContain('aria-label="Settings"');
    }
  });

  it('does not hide an empty row with CSS: the element is simply not there', () => {
    const tsx = fs.readFileSync(path.join(root, 'renderer/src/components/WorkspaceNavigation.tsx'), 'utf8');
    expect(tsx).toMatch(/\{corner && <div className="th-me">\{corner\}<\/div>\}/);
    for (const sheet of ['renderer/src/threads/pages.css', 'renderer/src/workspace-navigation.css', 'renderer/src/team/team.css']) {
      expect(fs.readFileSync(path.join(root, sheet), 'utf8')).not.toContain('.th-me:empty');
    }
  });
});

describe('the corner still belongs to whoever is in it', () => {
  it('keeps your own row when you are signed in', () => {
    const html = draw({ team: onATeam, onAccount: noop });
    expect(html).toContain('class="th-me"');
    expect(html).toContain('Ada Lovelace');
  });

  it('keeps the sign-in row when the team cloud is set up and there is a way in', () => {
    const html = draw({ team: signedOut, onTeam: noop });
    expect(html).toContain('class="th-me"');
    expect(html).toContain('Sign in to your team');
  });
});

describe('the air under Settings', () => {
  const foot = declsOf(nav, '.workspace-utilities');
  const footAlone = declsOf(nav, '.workspace-utilities:last-child');

  it('is the 4 points she picked when nothing follows the foot list', () => {
    expect(px(footAlone['padding-bottom'])).toBe(4);
  });

  it('is none of the numbers she turned down: 12, 30, 52, 66, nor the 0 she passed over', () => {
    for (const n of [0, 8, 12, 30, 52, 66]) expect(px(footAlone['padding-bottom'])).not.toBe(n);
  });

  it('leaves the 12 points above a row that is there alone', () => {
    expect(px(foot['padding-bottom'])).toBe(12);
  });
});
