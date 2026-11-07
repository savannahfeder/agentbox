// THE WEB APP ON A PHONE DRAWS ITS INBOX THE WAY THE PHONE APP DOES (2026-10-28).
//
// On an iPhone the web app's inbox felt "somehow a bit uncomfortable", and its
// Needs you, In progress, Later, Done bar was "super duper low and worse
// vibes". The phone app on the same iPhone was the fix: "This spacing in the
// mobile app image is perfect ... Everything there has just a bit bigger font."
//
// Measured from the two screenshots (both 1206px wide, 3x): the phone app drew
// "Desktop folder picker escape and key leak" 338.0pt wide, where Geist at the
// 16px both apps ask for is 304.6pt; the web app drew its title at 283.7pt
// against 277.0pt, that is at the size asked. The phone app follows the
// iPhone's text size (React Native scales every Text by it), one step over the
// default on that phone, 19/17 = 1.118. The web app ignored it.
// And its bar sat 14px lower: the phone app keeps the whole home bar inset
// under its tabs (footRoom, mobile/src/ui/parts.tsx), the web app kept the
// inset less 14px.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { textScale } from '../renderer/src/phone-text.ts';

const css = fs.readFileSync('renderer/src/phone.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const phone = css.slice(css.indexOf('@media (max-width: 700px), (max-height: 520px)'));
const rules = [...phone.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
const last = (piece, prop) => {
  const body = rules.filter((r) => r.selector.split(',').some((s) => s.trim().endsWith(piece))).map((r) => r.body).join(';');
  const all = [...body.matchAll(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)`, 'g'))];
  return all.length ? all[all.length - 1][1].trim() : undefined;
};

describe("the iPhone's text size", () => {
  it('is 1 at the default, where the body text is 17px', () => {
    expect(textScale(17)).toBe(1);
  });
  it('is 1.118 one step up, as the phone app drew it', () => {
    expect(textScale(19)).toBeCloseTo(1.118, 3);
  });
  it('shrinks with a smaller setting, as the phone app does', () => {
    expect(textScale(15)).toBeCloseTo(0.882, 3);
  });
  it('stops at 1.35 for the largest accessibility sizes, before the rows break', () => {
    expect(textScale(53)).toBe(1.35);
    expect(textScale(10)).toBe(0.8);
  });
  it('is 1 where nothing says, in any browser but an iPhone', () => {
    for (const v of [0, NaN, -3, undefined]) expect(textScale(v)).toBe(1);
  });
  it('is read from the page and set as --phone-type', () => {
    const src = fs.readFileSync('renderer/src/phone-text.ts', 'utf8');
    expect(src).toMatch(/-apple-system-body/);
    expect(src).toMatch(/setProperty\('--phone-type'/);
    expect(fs.readFileSync('renderer/src/phone-screen.ts', 'utf8')).toMatch(/followTextSize\(\)/);
  });
});

describe('the inbox on a phone', () => {
  it("scales a row's title and its quiet line by it, and keeps the row's own room", () => {
    expect(last('.th-grid > :nth-child(1)', 'font-size')).toBe('calc(16px * var(--phone-type, 1))');
    expect(last('.th-grid > :nth-child(2)', 'font-size')).toBe('calc(11px * var(--phone-type, 1))');
    expect(last('.th-grid > :last-child', 'font-size')).toBe('calc(11px * var(--phone-type, 1))');
    expect(last('.th-table .row', 'padding-top')).toBe('14px');
  });
  it('scales the tabs, their counts and the title over them', () => {
    expect(last('.tm-tab', 'font-size')).toBe('calc(15px * var(--phone-type, 1))');
    expect(last('.tm-tab b', 'font-size')).toBe('calc(11.5px * var(--phone-type, 1))');
    expect(last('.topbar .workspace-title', 'font-size')).toBe('calc(19px * var(--phone-type, 1))');
  });
  it('keeps the whole home bar inset at the foot, as the phone app does', () => {
    const foot = rules.filter((r) => r.selector === ':root').map((r) => r.body).join(';').match(/--phone-foot:\s*([^;]+)/);
    expect(foot?.[1].trim()).toBe('max(8px, env(safe-area-inset-bottom, 0px))');
    const app = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
    expect(app).toMatch(/Math\.max\(8, inset\.bottom\)/);
  });
});

// THE TABS GO TO THE TOP, IN BOTH (2026-10-28). Drawn under the title on the
// phone app they "do a lot better", and she asked for "both phone and web to
// bring needs you/in progress/etc menu up to the top". The first drawing ran a
// line under the title and another under the tabs, which "doesn't really work
// well": there is one, and the picked tab's mark lies on it. At 16.5pt the four
// tabs with two-figure counts ran 407pt on a phone set a text step up, past its
// 402pt; at 15pt they run 383pt and read 16.8pt there.
describe('the tabs on the web app on a phone', () => {
  it('sit at the top of the list, no longer pinned to the foot', () => {
    expect(last('.list-pane > .th-bar', 'position')).toBe('relative');
    expect(last('.list-pane > .th-bar', 'bottom')).toBeUndefined();
    expect(last('.list-pane > .th-bar', 'height')).toBe('44px');
    expect(last('.list-pane > .th-bar', 'padding')).not.toMatch(/phone-foot/);
  });
  it('leave nothing along the bottom to sit above', () => {
    const tabs = rules.filter((r) => /\.app\.workspace-layout/.test(r.selector) && /--phone-tabs/.test(r.body)).map((r) => r.body).join(';');
    expect(tabs).toMatch(/--phone-tabs:\s*0px/);
  });
  it('paint one line at their foot, and the picked one\'s mark is the foot of its box', () => {
    // A shadow and not a border, so the bar shows the wall and has no border
    // for the tab's mark to sit above.
    expect(last('.list-pane > .th-bar', 'background')).toBe('transparent');
    expect(last('.list-pane > .th-bar', 'box-shadow')).toBe('inset 0 -1px var(--line)');
    expect(last('.list-pane > .th-bar', 'border-bottom')).toBe('0');
    expect(last('.tm-tab', 'height')).toBe('100%');
    expect(last('.tm-tab', 'border-bottom')).toBe('2px solid transparent');
    expect(last('.tm-tab.on', 'border-bottom-color')).toBe('var(--accent)');
  });
  it('start from the left, 18px apart, as the phone app\'s do', () => {
    expect(last('.tm-tabs', 'justify-content')).toBe('flex-start');
    expect(last('.tm-tabs', 'gap')).toBe('18px');
  });
  it("hide the desktop card's corner marks, which showed either side of the home bar", () => {
    expect(last('.panel-marks', 'display')).toBe('none');
  });
});

describe('the tabs on the phone app', () => {
  const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
  const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
  const between = (src, start) => src.slice(src.indexOf(start), src.indexOf('\n}\n', src.indexOf(start)));
  const tabs = between(inbox, 'function Tabs(');
  const row = between(inbox, 'function ThreadRow(');

  it('are drawn inside the top bar, above its one line, and only there', () => {
    expect(between(parts, 'export function TopBar(')).toMatch(/\{below\}/);
    expect(inbox).toMatch(/below=\{board \? undefined : <Tabs on=\{onEverything \? 'everything' : tab\} counts=\{counts\} pick=\{setPlace\} team=\{teamMode\} \/>\}/);
    // And under Chats' own bar while it is open, never along the foot.
    expect(inbox).toMatch(/<ChatsPlace tabs=\{<Tabs on="chats"/);
    expect(inbox.match(/<Tabs /g)).toHaveLength(2);
  });
  it('draw no line of their own; the picked word is underlined, as at the bottom', () => {
    // The look itself is in the-phone-apps-tabs-at-the-top-keep-the-bottom-bars-look.
    expect(tabs).not.toMatch(/border(Top|Bottom)Width: 1/);
    expect(tabs).toMatch(/borderBottomWidth: 2, borderBottomColor: on === t\.id \? color\.accent/);
  });
  it('are 15pt, start where the title does, and scroll on a phone set larger still', () => {
    expect(tabs).toMatch(/fontSize: 15,/);
    expect(tabs).toMatch(/paddingLeft: size\.inset/);
    expect(tabs).toMatch(/<ScrollView horizontal/);
  });
  it('leave the new-thread button on the home bar room, and the rows as they were', () => {
    expect(inbox).toMatch(/bottom: foot \+ 16,/);
    expect(row).toMatch(/paddingTop: 14, paddingBottom: 14/);
    expect(row).toMatch(/fontSize: 16, lineHeight: 21\.6/);
  });
});
