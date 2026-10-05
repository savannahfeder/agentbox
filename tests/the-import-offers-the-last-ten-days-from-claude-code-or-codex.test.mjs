// THE IMPORT OFFERS THE LAST TEN DAYS OF AGENTS, FROM CLAUDE CODE OR CODEX.
//
// Asked before launch (w-db6f5e331e): "Showing your recently active agents over
// the last 10 days and giving them the option to import them", a ⌘K command to
// import from Codex or Claude Code at any time, and "it should also work if
// you're only a Codex user".
//
// What was measured before this change, on the code as it stood:
//   - the window was 7 days, in two constants (agent-sessions RECENT_DAYS and
//     codex-threads CODEX_RECENT_DAYS), so a conversation 9 days old was not
//     offered by either reader;
//   - the Codex reader opened the newest 7 DAY FOLDERS, which Codex names after
//     the day a conversation STARTED, so a conversation started 14 days ago and
//     worked in yesterday was never opened at all;
//   - a thread 8 days old read with no "when" on the card (whenWords gave '');
//   - the ⌘K line said "Import your Claude Code agents", so a Codex-only person
//     had no reason to think it was for them.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RECENT_DAYS, readSessionThreads } from '../main/agent-sessions.mjs';
import { CODEX_RECENT_DAYS, readCodexThreads } from '../main/codex-threads.mjs';
import { whenWords } from '../shared/agent-import.mjs';
import { Palette } from '../renderer/src/components/Palette';

const DAY = 86400e3;
// Real time, because the Codex reader stats files and the files are written now.
const NOW = Date.now();

let home;

function claudeThread({ id, daysAgo }) {
  const dir = path.join(home, '.claude', 'projects', '-work-app');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(file, `${JSON.stringify({
    type: 'user', sessionId: id, cwd: path.join(home, 'work', 'app'), entrypoint: 'cli', userType: 'external',
    message: { role: 'user', content: [{ type: 'text', text: `fix the thing ${id}` }] },
  })}\n`);
  const when = new Date(NOW - daysAgo * DAY);
  fs.utimesSync(file, when, when);
}

const ymd = (t) => {
  const d = new Date(t);
  return [String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')];
};

/** A Codex transcript filed under the day it STARTED, last written `touchedDaysAgo`. */
function codexThread(codexDir, { id, startedDaysAgo, touchedDaysAgo = startedDaysAgo }) {
  const started = NOW - startedDaysAgo * DAY;
  const [y, m, d] = ymd(started);
  const dir = path.join(codexDir, 'sessions', y, m, d);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollout-${y}-${m}-${d}T10-00-00-${id}.jsonl`);
  const ts = new Date(started).toISOString();
  fs.writeFileSync(file, [
    JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { id, session_id: id, timestamp: ts, cwd: path.join(home, 'work', 'app'), originator: 'codex_cli_rs', source: 'cli', thread_source: 'user' } }),
    JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: `please look at ${id}` } }),
  ].join('\n') + '\n');
  const touched = new Date(NOW - touchedDaysAgo * DAY);
  fs.utimesSync(file, touched, touched);
}

beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'ten-days-home-'));
  fs.mkdirSync(path.join(home, 'work', 'app'), { recursive: true });
});
afterAll(() => fs.rmSync(home, { recursive: true, force: true }));

describe('the window is ten days, on both readers', () => {
  it('is ten for Claude Code and for Codex', () => {
    expect(RECENT_DAYS).toBe(10);
    expect(CODEX_RECENT_DAYS).toBe(10);
  });

  it('offers a Claude Code thread from nine days ago, and not one from eleven', () => {
    claudeThread({ id: 'c-nine', daysAgo: 9 });
    claudeThread({ id: 'c-eleven', daysAgo: 11 });
    const ids = readSessionThreads({ home, now: NOW }).threads.map((t) => t.id);
    expect(ids).toContain('c-nine');
    expect(ids).not.toContain('c-eleven');
  });
});

describe('a Mac with only Codex', () => {
  let codexHome;
  let codexDir;
  beforeAll(() => {
    // A second home with no ~/.claude at all.
    codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-only-home-'));
    fs.mkdirSync(path.join(codexHome, 'work', 'app'), { recursive: true });
    codexDir = path.join(codexHome, '.codex');
    const prev = home;
    home = codexHome;
    // One conversation on each of the last eleven days, so the old walk's
    // "newest N day folders" runs out before it reaches the two-week-old one.
    for (let i = 1; i <= 11; i += 1) codexThread(codexDir, { id: `daily-${i}`, startedDaysAgo: i });
    // Started two weeks ago, worked in yesterday: recently active.
    codexThread(codexDir, { id: 'long-running', startedDaysAgo: 14, touchedDaysAgo: 1 });
    // Started two weeks ago and left: not recent.
    codexThread(codexDir, { id: 'left-alone', startedDaysAgo: 15 });
    home = prev;
  });
  afterAll(() => fs.rmSync(codexHome, { recursive: true, force: true }));

  it('reads nothing from Claude Code, and does not throw', () => {
    expect(fs.existsSync(path.join(codexHome, '.claude'))).toBe(false);
    expect(readSessionThreads({ home: codexHome, now: NOW }).threads).toEqual([]);
  });

  it('offers the Codex conversations from the last ten days, and not the eleventh', () => {
    const ids = readCodexThreads({ home: codexHome, codexDir, now: NOW }).threads.map((t) => t.id);
    expect(ids).toContain('daily-1');
    expect(ids).toContain('daily-9');
    expect(ids).not.toContain('daily-11');
  });

  it('offers a conversation started two weeks ago that was worked in yesterday', () => {
    const ids = readCodexThreads({ home: codexHome, codexDir, now: NOW }).threads.map((t) => t.id);
    expect(ids).toContain('long-running');
    expect(ids).not.toContain('left-alone');
  });
});

describe('the card says when, for the whole window', () => {
  const at = Date.parse('2026-10-05T12:00:00');
  it('names the weekday inside a week', () => {
    expect(whenWords(at - 4 * DAY, at)).toBe('on Thursday');
  });
  it('names the date past a week, which a weekday would get wrong', () => {
    expect(whenWords(at - 8 * DAY, at)).toBe('on September 27');
    expect(whenWords(at - 10 * DAY, at)).toBe('on September 25');
  });
  it('says nothing for something far outside the window', () => {
    expect(whenWords(at - 40 * DAY, at)).toBe('');
  });
});

describe('Look again', () => {
  it('reads the conversations again, not only the agent files', () => {
    const card = fs.readFileSync(new URL('../renderer/src/components/ImportAgents.tsx', import.meta.url), 'utf8');
    const body = card.slice(card.indexOf('const lookAgain'), card.indexOf('}, [looking'));
    expect(body).toContain('api.agentThreads()');
    expect(body).toContain('setThreads(');
  });
});

describe('⌘K', () => {
  const noop = () => {};
  const labels = () => {
    const html = renderToStaticMarkup(createElement(Palette, new Proxy({
      products: [], supervisorPaused: false, look: 'dark', order: [],
    }, { get: (t, k) => (k in t ? t[k] : noop), has: () => true })));
    return [...html.matchAll(/<div class="palette-item[^"]*"><span>([^<]*)<\/span>/g)].map((m) => m[1]);
  };
  it('has one import line, and it names Codex as well as Claude Code', () => {
    const imports = labels().filter((l) => /^Import/.test(l));
    expect(imports).toEqual(['Import agents from Claude Code or Codex']);
  });
});
