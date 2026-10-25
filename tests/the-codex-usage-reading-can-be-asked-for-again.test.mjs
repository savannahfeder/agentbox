// SETTINGS > CODEX SAID "No usage reading yet" AND OFFERED NO WAY TO ASK.
//
// Measured on the Linux box, 2026-10-23 (F-34): the Usage group read that line
// before the first run and filled in only after one, with nothing to press in
// between. Claude Code's Signed in place has had Refresh and a "Checked N
// minutes ago" since 2026-09; Codex had neither, because its figures arrive
// unprompted and nobody had given the page a way to ask for a newer one.
//
// WHAT REFRESH DOES AND DOES NOT DO. It does not ask OpenAI anything:
// main/codex-usage.mjs holds the measurement and the reason an explicit
// rate-limits read is deliberately absent. It walks Codex's own session log
// again, which is the case that matters — Codex run in its own app, where the
// newest figure on the computer is one Codex itself wrote down and the app is
// otherwise waiting half a minute for a cache to lapse.
//
// AND IT STILL ANSWERS NOTHING WHERE THERE IS NOTHING. A computer Codex has
// never run on has no log, and an empty panel is the honest reading.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexUsage } from '../main/codex-usage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const WEEK = { primary: { used_percent: 41, window_minutes: 10080, resets_at: 1790215059 } };
const LATER = { primary: { used_percent: 55, window_minutes: 10080, resets_at: 1790215059 } };

describe('asking Codex for its figure again', () => {
  // THE DEFECT: a second read inside the cache window answered the first one,
  // so a press would have changed nothing on the screen.
  it('walks the log again instead of answering out of the cache', () => {
    let now = 1_000_000;
    const answers = [{ snapshot: WEEK, at: 10 }, { snapshot: LATER, at: 20 }];
    let asked = 0;
    const usage = new CodexUsage({ home: () => '/codex', now: () => now, readLog: () => answers[Math.min(asked++, 1)] });

    expect(usage.read().limits[0].percent).toBe(41);
    // Same second: the cache is doing its job and nothing is re-read.
    expect(usage.read().limits[0].percent).toBe(41);
    expect(asked).toBe(1);

    expect(usage.refreshNow().limits[0].percent).toBe(55);
    expect(asked).toBe(2);
  });

  // THE CASE THAT MUST NOT CHANGE: a push is this second's truth, and a
  // refresh does not go looking behind it.
  it('still prefers what the app-server pushed', () => {
    const usage = new CodexUsage({ home: () => '/codex', readLog: () => ({ snapshot: LATER, at: 20 }) });
    usage.saw('account/rateLimits/updated', { rateLimits: { primary: { usedPercent: 7, windowDurationMins: 300, resetsAt: 1788573509 } } }, '/codex');
    expect(usage.refreshNow().limits[0].percent).toBe(7);
  });

  // AND NOTHING WHERE THERE IS NOTHING.
  it('answers null on a computer Codex has never run on', () => {
    expect(new CodexUsage({ home: () => '/codex', readLog: () => null }).refreshNow()).toBe(null);
  });

  // NOTHING IS SPAWNED AND NOTHING LEAVES THE COMPUTER. The whole reason the
  // Codex reader exists in the shape it does.
  it('starts no process and makes no request', () => {
    const src = read('main/codex-usage.mjs');
    expect(src).not.toMatch(/spawn|exec|fetch\(/);
  });
});

describe('the control the page offers', () => {
  const settings = read('renderer/src/components/Settings.tsx');
  const page = settings.slice(settings.indexOf('const enginePage = (engine'), settings.indexOf('<div className="set-nav">'));

  // On the Signed in card's head since 2026-10-25, the one Claude Code's has.
  it('puts Refresh and how old the reading is at the head of the Codex accounts', () => {
    expect(page).toContain("const busy = engine === 'codex' ? codexRefreshing : refreshing;");
    expect(page).toContain("engine === 'codex' ? refreshCodex() : readAccounts(true)");
    expect(page).toContain('{!busy && checked && <span className="acct-checked">{checked}</span>}');
  });

  // The press reaches the Codex reader and not Claude Code's.
  it('asks for the Codex engine by name', () => {
    expect(settings).toContain("api.refreshUsage('codex')");
    expect(read('main/ipc.mjs')).toContain('supervisor.refreshCodexUsage()');
  });

  // AND THE EMPTY LINE SAYS WHY IT IS EMPTY, which is the other half of what
  // was wrong: "No usage reading yet" alone reads as something broken. One
  // line, with no caption under it, because a caption goes unread.
  it('says why there is nothing yet, in one line', () => {
    expect(page).toContain("none: tile.inUse ? 'Codex reports usage as it works'");
  });
});
