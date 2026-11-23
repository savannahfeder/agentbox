// THE SETTING FOR AGENTS YOU STARTED YOURSELF IS WHERE YOU MEET THEM.
//
// The founder on w-34f79ab66e (2026-11-23), once sessions started in Claude
// Code or Codex came to the inbox by default: "we need an easy entry point to
// configure that or turn that off ... something in maybe the top-right corner
// via the kebab bar might be natural, or a Command-K menu. The Command-K menu,
// though, is not discoverable." The only control was one row on the Running
// page of Settings. It is now also on each of those sessions' ⋯ menu, on the
// inbox's View and filters, and in ⌘K, all in the Settings row's words.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';
import { DisplayMenu } from '../renderer/src/threads/Pages.tsx';
import { OUTSIDE_MODES, OUTSIDE_SAID, OUTSIDE_TITLE, outsideCommands, outsideLabel } from '../renderer/src/outside-agents.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const base = { change: false, terminal: null, finish: true } as const;

describe('the ⋯ menu on one of those sessions', () => {
  it('has a row naming the setting and what it is now', () => {
    const row = threadMenuRows({ ...base, outside: 'waiting' }).find((r) => r.id === 'outside');
    expect(row).toMatchObject({ label: 'Agents you started yourself', detail: 'Only the stuck ones' });
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
    expect(html).toContain('Outside Agentbox');
    for (const m of OUTSIDE_MODES) expect(html).toContain(`>${m.label}</button>`);
    expect(html).toContain('class="on">None</button>');
    expect(html).not.toContain('class="on">All of them</button>');
  });
  it('and none of it where the page gives no setting (the team page)', () => {
    expect(draw(null)).not.toContain('Outside Agentbox');
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
      'Agents you started yourself: all of them',
      'Agents you started yourself: only the stuck ones',
      'Agents you started yourself: none',
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
    expect(OUTSIDE_TITLE).toBe('Agents you started yourself');
    expect(outsideLabel('off')).toBe('None');
  });
  it('a toast for each, without a colon', () => {
    for (const m of OUTSIDE_MODES) expect(OUTSIDE_SAID[m.value]).not.toContain(':');
  });
});
