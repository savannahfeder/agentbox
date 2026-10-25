// SETUP ENDS ON THE CHATS YOU WERE IN THE MIDDLE OF.
//
// The founder approved R1 (w-62228098e6) for setup's last screen: "Pick up
// where you left off", only the chats that were waiting on you, ticked, each
// with its last question; one line saying the finished ones from this week go
// to Done; a tick to keep bringing in new chats; "Bring in 3".
//
// Before it, the same screen was every chat from the last ten days, all
// ticked, named after the first thing typed, and every one landed in Needs
// you. These are the sentences and the arithmetic the screen draws from.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PICKUP, finishedForDone, pickupChats, pickupLine, pickupLines } from '../renderer/src/agent-import-card';

const DAY = 86400e3;
const NOW = Date.UTC(2026, 9, 24, 12);
const chat = (id, { waiting = false, daysAgo = 0, imported = false, ask = '' } = {}) => ({
  id, source: id.startsWith('cx') ? 'codex' : 'terminal', folder: '/w/kestrel', folderName: 'kestrel', short: '~/w/kestrel',
  title: `Chat ${id}`, when: NOW - daysAgo * DAY, path: `/t/${id}`, waiting, ask, imported,
});

describe('which chats the screen offers', () => {
  const threads = [
    chat('w1', { waiting: true, ask: 'Which one?' }),
    chat('cx2', { waiting: true, daysAgo: 2, ask: 'Skip them?' }),
    chat('f1', { daysAgo: 1 }),
    chat('f2', { daysAgo: 6 }),
    chat('old', { daysAgo: 8 }),
    chat('in', { waiting: true, imported: true }),
  ];
  const { waiting, finished } = pickupChats(threads, NOW);

  it('lists the ones waiting on you that are not in yet', () => {
    expect(waiting.map((t) => t.id)).toEqual(['w1', 'cx2']);
  });

  it('counts the finished ones from this week, and only this week, for Done', () => {
    expect(finished.map((t) => t.id)).toEqual(['f1', 'f2']);
  });
});

describe('which finished chats go to Done', () => {
  // A finished chat in a folder no project points at would make the press
  // create a project just to hold a closed row. It goes to Done only where a
  // project exists, or where a ticked waiting chat is making one anyway.
  const dests = [
    { key: 'project:kestrel', kind: 'project', name: 'Kestrel', slug: 'kestrel', folder: '/w/kestrel', where: '~/w/kestrel', items: [],
      threads: [chat('kf', { daysAgo: 1 })] },
    { key: 'new:/w/thicket', kind: 'new', name: 'Thicket', slug: null, folder: '/w/thicket', where: '~/w/thicket', items: [],
      threads: [chat('tw', { waiting: true, ask: 'Which?' }), chat('tf', { daysAgo: 2 })] },
    { key: 'new:/w/other', kind: 'new', name: 'Other', slug: null, folder: '/w/other', where: '~/w/other', items: [],
      threads: [chat('of', { daysAgo: 1 })] },
  ];
  const finished = [chat('kf', { daysAgo: 1 }), chat('tf', { daysAgo: 2 }), chat('of', { daysAgo: 1 })];

  it('are those in a project, and those beside a chat you ticked', () => {
    expect(finishedForDone(dests, finished, ['/t/tw']).map((t) => t.id)).toEqual(['kf', 'tf']);
  });

  it('leave out a new folder once its waiting chat is unticked', () => {
    expect(finishedForDone(dests, finished, []).map((t) => t.id)).toEqual(['kf']);
  });
});

describe('the lines it draws', () => {
  it('carry the question each chat ended on, with where it came from', () => {
    const dests = [{
      key: 'project:kestrel', kind: 'project', name: 'Kestrel', slug: 'kestrel', folder: '/w/kestrel', where: '~/w/kestrel', items: [],
      threads: [chat('w1', { waiting: true, ask: 'Which one?' }), chat('cx2', { waiting: true, daysAgo: 1, ask: 'Skip them?' })],
    }];
    const lines = pickupLines(dests, NOW);
    expect(lines.map((l) => [l.title, l.ask, l.meta])).toEqual([
      ['Chat w1', 'Which one?', 'Claude Code · Kestrel · today'],
      ['Chat cx2', 'Skip them?', 'Codex · Kestrel · yesterday'],
    ]);
  });
});

describe('its words', () => {
  // The approved line named both apps and promised the same conversation. A
  // Claude Code chat does carry on as the same conversation; a Codex chat
  // carries on here from what it said, in a new one. So the line names only
  // the apps on the list and promises only what is true of all of them.
  it('say where the chats came from, and the same conversation only when that is true', () => {
    const t = (source) => ({ source, waiting: true });
    expect(pickupLine([t('terminal'), t('desktop')])).toBe('These were waiting on you in Claude Code. They carry on here, in the same conversation.');
    expect(pickupLine([t('codex')])).toBe('These were waiting on you in Codex. They carry on here.');
    expect(pickupLine([t('editor'), t('codex')])).toBe('These were waiting on you in Claude Code and Codex. They carry on here.');
    expect(pickupLine([])).toBe(PICKUP.lineNone);
  });

  it('are the approved ones', () => {
    expect(PICKUP.head).toBe('Pick up where you left off');
    expect(PICKUP.keep).toBe('Keep bringing in new chats from Claude Code and Codex');
    expect(PICKUP.finished(17)).toBe('The 17 finished chats from this week go to Done.');
    expect(PICKUP.go(3)).toBe('Bring in 3');
    expect(PICKUP.notNow).toBe('Not now');
  });

  it('say one chat and no chats plainly', () => {
    expect(PICKUP.finished(1)).toBe('The one finished chat from this week goes to Done.');
    expect(PICKUP.finished(0)).toBe('');
    expect(PICKUP.go(0)).toBe('Continue');
  });

  it('write no em dash and no colon anywhere on the screen', () => {
    const both = pickupLine([{ source: 'terminal' }, { source: 'codex' }]);
    const all = [PICKUP.head, both, PICKUP.lineNone, PICKUP.keep, PICKUP.finished(17), PICKUP.go(3), PICKUP.notNow].join(' ');
    expect(all).not.toMatch(/—|:/);
  });
});

describe('the screen', () => {
  const card = fs.readFileSync(new URL('../renderer/src/components/ImportAgents.tsx', import.meta.url), 'utf8');

  it('files what it brings in sorted, so the finished chats land in Done', () => {
    expect(card).toMatch(/land:\s*'sorted'/);
  });

  it('turns on the watch for new chats only when the tick is left on', () => {
    expect(card).toMatch(/setWorkspaceSetting\(\{\s*key:\s*'importNew'/);
  });
});
