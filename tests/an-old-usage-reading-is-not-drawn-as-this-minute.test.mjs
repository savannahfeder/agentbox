// AN OLD READING WAS DRAWN AS THOUGH IT WERE THIS MINUTE (w-7b7182ef61).
//
// On the Linux QA box, an app left open about six hours showed "This session —
// 1% used — Resets any moment" over "Read 4h ago", and the tooltip said the
// same. The five hour window in that reading had ended hours before; what the
// corner was counting down to had already happened, and "any moment" was the
// countdown bottoming out at zero rather than a fact about the account.
// Relaunching showed "Codex 1% … Resets in 4h 56m … Read just now" off Codex's
// own session log, which means the fresher figure had been on the disk the
// whole time and the app was holding a four hour old push in front of it.
//
// So two rules, measured off that screenshot:
//
//   A window whose reset has gone past is not drawn. We know what the window
//   that ENDED was at; we know nothing about the one running now, and the
//   dashboard law in shared/codex-usage.mjs ("absence of data and a real zero
//   are different facts") covers a spent window as much as an unread one. A
//   couple of minutes of grace keeps a live countdown from flickering out as
//   it crosses zero.
//
//   The newer of the push and the log wins. "The push still wins" was written
//   when the push was always the newer of the two; a push from four hours ago
//   is not this second's truth, and the log entry beside it is.
//
// And the third thing in the same report: the panel hangs over Feedback and
// Settings, and the first click on Settings did nothing until Escape, because
// the panel was over that row and ate the press. The panel has nothing in it to
// click, so it takes no pointer at all.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { limitRows, limitsStillRunning, usageSentence } from '../shared/usage.mjs';
import { UsagePill, agentsInUse } from '../renderer/src/components/UsagePill.tsx';
import { CodexUsage } from '../main/codex-usage.mjs';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-24T18:00:00Z');

const limit = (over) => ({ span: 'session', qualifier: null, name: 'This session', percent: 1, resetsAt: null, resetsText: null, resetsOn: null, zone: null, ...over });
const week = (over) => limit({ span: 'week', name: 'This week', percent: 9, resetsAt: NOW + 6 * DAY + 4 * HOUR, ...over });

// What the screenshot held: read four hours ago, and the five hour window it
// names ran out somewhere in between.
const ENDED = limit({ resetsAt: NOW - 3 * HOUR });
const HERS = { engine: 'codex', at: NOW - 4 * HOUR, limits: [ENDED, week()] };

describe('a window that has started over since we read it', () => {
  it('is not counted down to as though it were still running', () => {
    expect(limitRows([ENDED, week()], NOW).map((r) => r.name)).toEqual(['This week']);
    expect(usageSentence([ENDED, week()], NOW)).toBe('This week: 9% used, 6d 4h left.');
    expect(usageSentence([ENDED], NOW)).toBe(null);
  });

  it('is still drawn as it crosses zero, so a live countdown does not flicker out', () => {
    expect(limitsStillRunning([limit({ resetsAt: NOW + 30_000 })], NOW)).toHaveLength(1);
    expect(limitRows([limit({ resetsAt: NOW + 30_000 })], NOW)[0].when).toBe('Resets any moment');
    expect(limitRows([limit({ resetsAt: NOW - 60_000 })], NOW)[0].when).toBe('Resets any moment');
  });

  it('and is gone once the reading is plainly older than the window it names', () => {
    expect(limitsStillRunning([limit({ resetsAt: NOW - 3 * 60_000 })], NOW)).toEqual([]);
    expect(limitsStillRunning([ENDED, week()], NOW)).toEqual([week()]);
  });

  // A reset we could not turn into an instant keeps its row: we cannot say it
  // has gone past, and refusing to guess is this file's whole habit. That is
  // every Claude reading taken in another timezone.
  it('keeps a limit whose reset is a clock time we cannot place', () => {
    const said = limit({ resetsText: '3:59pm', resetsOn: 'Sep 3' });
    expect(limitsStillRunning([said], NOW)).toEqual([said]);
    expect(limitRows([said], NOW)[0].when).toBe('Resets Sep 3 at 3:59pm');
    expect(limitsStillRunning(null, NOW)).toEqual([]);
  });
});

describe('the corner on the reading from that screenshot', () => {
  const row = (props) => renderToStaticMarkup(createElement(UsagePill, { now: NOW, sidebar: true, usage: HERS, all: [HERS], recent: 'codex', ...props }));
  // The whole reading, for whatever reads the corner aloud and for the tooltip.
  const aloud = (html) => html.match(/aria-label="([^"]*)"/)?.[1];

  it('says nothing about a session that ended three hours ago', () => {
    expect(aloud(row())).toBe('Codex. This week: 9% used, 6d 4h left.');
  });

  it('names the week it can still answer for, rather than the spent session', () => {
    expect(row()).toContain('>9%<');
    expect(agentsInUse([HERS], 'codex', HERS, NOW).map((a) => a.word)).toEqual(['Codex']);
  });

  it('draws nothing at all when every window in the reading has gone past', () => {
    const spent = { ...HERS, limits: [ENDED] };
    expect(row({ usage: spent, all: [spent] })).toBe('');
    expect(agentsInUse([spent], 'codex', spent, NOW)).toEqual([]);
  });

  it('is untouched on a reading taken this minute', () => {
    const fresh = { engine: 'codex', at: NOW, limits: [limit({ resetsAt: NOW + 4 * HOUR + 56 * 60_000 }), week()] };
    expect(aloud(row({ usage: fresh, all: [fresh] }))).toBe('Codex. This session: 1% used, 4h 56m left. This week: 9% used, 6d 4h left.');
    expect(row({ usage: fresh, all: [fresh] })).toContain('>1%<');
  });
});

describe('the panel does not eat the click under it', () => {
  const css = () => read('../renderer/src/styles.css');

  // Opened by a pointer passing over the bar, it may not stand in the way of
  // where that pointer was going, and there is nothing in it to press.
  it('takes no pointer while it is only hovered', () => {
    expect(/\.usage-panel \{[^}]*pointer-events: none;/.test(css())).toBe(true);
    const panel = read('../renderer/src/components/UsagePill.tsx').split('usage-panel')[1];
    for (const clickable of ['<button', '<a ', '<input', 'onClick']) expect(panel).not.toContain(clickable);
  });

  // Pinned it does take the press, and closes on it, rather than passing it to
  // the update card's Restart under the corner.
  it('takes the press once you have pinned it, and closes on it', () => {
    expect(css()).toContain('.usage-panel.is-pinned { pointer-events: auto; }');
    const pill = read('../renderer/src/components/UsagePill.tsx');
    expect(pill).toContain('className={`usage-panel ${pinned ? \'is-pinned\' : \'\'}`}');
    // The bar, not the whole box: a press on the panel used to count as inside
    // and left the panel standing with nothing happening at all.
    expect(pill).toContain('if (!bar.current?.contains(e.target as Node)) setPinned(false);');
    expect(pill).toContain("if (e.key !== 'Escape') return;");
  });
});

describe('the newer of what Codex pushed and what Codex wrote down', () => {
  const logged = (at, percent) => () => ({ snapshot: { primary: { used_percent: percent, window_minutes: 300, resets_at: (NOW + HOUR) / 1000 } }, at });
  const push = (usage, at, percent) => usage.saw('account/rateLimits/updated', {
    rateLimits: { primary: { usedPercent: percent, windowDurationMins: 300, resetsAt: at / 1000 + 5 * 3600 } },
  }, '/codex');

  it('prefers the log when the push it holds is hours older', () => {
    let clock = NOW - 4 * HOUR;
    const usage = new CodexUsage({ home: () => '/codex', now: () => clock, readLog: logged(NOW, 7) });
    push(usage, clock, 1);
    clock = NOW;
    expect(usage.read()).toMatchObject({ at: NOW, limits: [{ percent: 7 }] });
  });

  it('and still prefers the push while the push is the newer of the two', () => {
    const usage = new CodexUsage({ home: () => '/codex', now: () => NOW, readLog: logged(NOW - HOUR, 7) });
    push(usage, NOW, 1);
    expect(usage.read()).toMatchObject({ at: NOW, limits: [{ percent: 1 }] });
  });

  it('reads the log when nothing has pushed, and answers null when neither has anything', () => {
    const only = new CodexUsage({ home: () => '/codex', now: () => NOW, readLog: logged(NOW - HOUR, 7) });
    expect(only.read().limits[0].percent).toBe(7);
    expect(new CodexUsage({ home: () => '/codex', now: () => NOW, readLog: () => null }).read()).toBe(null);
  });
});
