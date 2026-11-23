// THE SETTING FOR AGENTS YOU STARTED YOURSELF IS WHERE YOU MEET THEM.
//
// The founder on w-34f79ab66e (2026-11-23), once sessions started in Claude
// Code or Codex came to the inbox by default: "we need an easy entry point to
// configure that or turn that off ... something in maybe the top-right corner
// via the kebab bar might be natural, or a Command-K menu. The Command-K menu,
// though, is not discoverable." The only control was one row on the Running
// page of Settings. It is now also on each of those sessions' ⋯ menu, on the
// inbox's View and filters, and in ⌘K, all in the Settings row's words.
// "Agents you started yourself: All of them, Only the stuck ones, None" was
// then sent back as long and unclear; it is Terminal sessions, shown Always,
// When they need you or Never.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';
import { DisplayMenu } from '../renderer/src/threads/Pages.tsx';
import { OUTSIDE_MODES, OUTSIDE_SAID, OUTSIDE_TITLE, outsideCommands, outsideLabel } from '../renderer/src/outside-agents.ts';
import { reachesInbox } from '../shared/agents.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const base = { change: false, terminal: null, finish: true } as const;

describe('the ⋯ menu on one of those sessions', () => {
  it('has a row naming the setting and what it is now', () => {
    const row = threadMenuRows({ ...base, outside: 'waiting' }).find((r) => r.id === 'outside');
    expect(row).toMatchObject({ label: 'All terminal sessions', detail: 'When they need you' });
  });
  it('is not on a thread Agentbox started', () => {
    expect(threadMenuRows({ ...base }).some((r) => r.id === 'outside')).toBe(false);
    expect(threadMenuRows({ ...base, outside: null }).some((r) => r.id === 'outside')).toBe(false);
  });
  it('is given only to a session started outside Agentbox', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toContain('outside={agent ? outside : null}');
    expect(focus).toContain('onOutside={agent ? onOutside : undefined}');
  });
});

describe('the inbox View and filters', () => {
  const display = { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' };
  const draw = (outside: unknown) => renderToStaticMarkup(React.createElement(DisplayMenu, { page: 'inbox', display, onDisplay: () => {}, products: [], tab: 'inbox', outside } as never));
  it('offers the three choices with the one in force lit', () => {
    const html = draw({ mode: 'off', onMode: () => {} });
    expect(html).toContain('Terminal sessions');
    for (const m of OUTSIDE_MODES) expect(html).toContain(`>${m.label}</button>`);
    expect(html).toContain('class="on">Never</button>');
    expect(html).not.toContain('class="on">Always</button>');
  });
  it('and none of it where the page gives no setting (the team page)', () => {
    expect(draw(null)).not.toContain('Terminal sessions');
  });
  it('is handed the inbox\'s setting, and changing it there raises no toast over the list it changes', () => {
    expect(read('renderer/src/App.tsx')).toContain("outside={{ mode: agentMode, onMode: (mode) => chooseOutside(mode, { say: false }) }}");
  });
});

describe('⌘K', () => {
  it('has a row for each choice and says which is on now', () => {
    const rows = outsideCommands('all');
    expect(rows.map((r) => r.to)).toEqual(['all', 'waiting', 'off']);
    expect(rows.map((r) => r.label)).toEqual([
      'Show terminal sessions: always',
      'Show terminal sessions: when they need you',
      'Show terminal sessions: never',
    ]);
    expect(rows.filter((r) => r.hint).map((r) => r.to)).toEqual(['all']);
  });
  it('is found by the words someone would type for it', () => {
    for (const word of ['terminal', 'codex', 'claude', 'hide', 'turn off', 'started yourself']) {
      expect(rows().some((r) => `${r.label} ${r.keywords}`.toLowerCase().includes(word)), word).toBe(true);
    }
    function rows() { return outsideCommands('waiting'); }
  });
});

describe('one set of words', () => {
  it('Settings reads the same three choices', () => {
    expect(read('renderer/src/components/Settings.tsx')).toContain('const AGENT_OPTIONS = OUTSIDE_MODES;');
    expect(OUTSIDE_TITLE).toBe('Terminal sessions');
    expect(outsideLabel('off')).toBe('Never');
  });
  it('a toast for each, without a colon', () => {
    for (const m of OUTSIDE_MODES) expect(OUTSIDE_SAID[m.value]).not.toContain(':');
  });
});

// A power tester set it to When they need you and watched a session that had
// just asked "who is the waitlist for?" leave the inbox (2026-11-23): the mode
// had only counted a session frozen on a prompt.
describe('When they need you', () => {
  const NOW = Date.parse('2026-11-23T09:00:00Z');
  const s = (over: object) => ({ pid: 1, sessionId: 's', name: 'shop', cwd: '/x', about: 'Waitlist', status: 'idle', startedByZero: false, lastActiveAt: NOW - 60_000, ...over });
  it('takes a session stopped on a prompt', () => {
    expect(reachesInbox(s({ status: 'waiting', waitingFor: 'permission prompt' }), NOW, 'waiting')).toBe(true);
  });
  it('and one whose newest message asks you something', () => {
    expect(reachesInbox(s({ lastSaid: 'I drafted three versions of the waitlist page.\n\nWhich do you want?' }), NOW, 'waiting')).toBe(true);
  });
  it('but not one that only reports what it did', () => {
    expect(reachesInbox(s({ lastSaid: 'Done. The waitlist page is live and the tests pass.' }), NOW, 'waiting')).toBe(false);
    expect(reachesInbox(s({ lastSaid: 'Done. The waitlist page is live and the tests pass.' }), NOW, 'all')).toBe(true);
  });
});

// The same tester typed a session's exact title into ⌘K and was told nothing
// matched while the row sat behind the search (2026-11-23).
describe('⌘K finds a terminal session by the name its row wears', () => {
  it('searches those rows with the threads', () => {
    expect(read('renderer/src/App.tsx')).toContain('searchThreads([...items, ...agentList], q, searchContext');
  });
  it('and a row shaped like one is found by its title', async () => {
    const { searchThreads } = await import('../renderer/src/threads/search.ts');
    const row = { id: 'agent:codex:cx-9', product: 'web', productName: 'Website', status: 'open', title: 'Codex: Ask waitlist audience', body: 'Codex in a terminal', kind: 'agent', labels: [], priority: 5, epoch: 0, claim: null, createdAt: 1, updatedAt: 1 };
    const hits = searchThreads([row] as never, 'Ask waitlist audience', { products: [], people: [], me: 'self' } as never);
    expect(hits.map((h: { item: { id: string } }) => h.item.id)).toEqual(['agent:codex:cx-9']);
  });
});
