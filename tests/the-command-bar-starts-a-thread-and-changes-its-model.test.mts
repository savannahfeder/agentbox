// ⌘K was the first place both power testers looked and three of the things
// they looked for were not in it.
//
// "new" offered New project, Check for updates, Set Agentbox up again and Open
// Agentbox as a new user, and no New thread: "it is the thing I do most"
// (power-test-1, issue 22).
//
// "model", "switch", "codex" and "claude" matched nothing useful
// (power-test-1 issue 20, power-test-2 issues 39 and 40). Changing a thread's
// model was only ever possible in the reply box's drawer, and that drawer
// lists ONE engine's models, so a thread begun on Claude Code could not be
// carried on in Codex by any path in the app: "that is what I'd reach for when
// Claude runs out."

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesQuery } from '../renderer/src/palette-rows.ts';
import { modelCommands } from '../renderer/src/thread-model-commands.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const palette = fs.readFileSync(path.join(root, 'renderer/src/components/Palette.tsx'), 'utf8');

const CODEX_MODELS = [
  { id: 'gpt-6.1-sol', label: 'GPT-6.1-Sol' },
  { id: 'gpt-6-astra', label: 'GPT-6-Astra' },
];
const BOTH = [{ id: 'claude', label: 'Claude Code', word: 'Claude Code' }, { id: 'codex', label: 'Codex', word: 'Codex' }];
const CLAUDE_ONLY = [{ id: 'claude', label: 'Claude Code', word: 'Claude Code' }];
const items = [
  { createdAt: 5, model: 'opus', engine: 'claude' },
  { createdAt: 4, model: 'opus', engine: 'claude' },
  { createdAt: 3, model: 'gpt-6.1-sol', engine: 'codex' },
  { createdAt: 2, model: 'sonnet', engine: 'claude' },
];
const opts = { items, codexModels: CODEX_MODELS, codexDefault: 'gpt-6.1-sol', engines: BOTH };

describe('typing "new"', () => {
  it('finds a New thread row', () => {
    const m = palette.match(/\{ id: 'new-thread',[^}]*\}/);
    expect(m, 'no new-thread row in the palette').toBeTruthy();
    const label = m[0].match(/label: '([^']+)'/)[1];
    const keywords = (m[0].match(/keywords: '([^']+)'/) ?? [, ''])[1];
    expect(matchesQuery('new', { label, keywords })).toBe(true);
  });

  // New project keeps row one: that was its own product decision, and the
  // complaint it answered was that the row sat at 82 of about 82
  // (tests/her-word-is-project). Second is still the top of the list.
  it('puts it second, right under New project', () => {
    const rows = [...palette.matchAll(/\{ id: '([a-z-]+)',/g)].map((m) => m[1]);
    expect(rows.slice(0, 2)).toEqual(['new-project', 'new-thread']);
  });
});

describe('the model rows on a Claude Code thread', () => {
  const rows = modelCommands({ engine: 'claude', model: 'opus' }, opts);

  it('are found by every word somebody reaches for', () => {
    for (const query of ['model', 'switch', 'codex', 'engine', 'change model']) {
      expect(rows.some((r) => matchesQuery(query, r)), query).toBe(true);
    }
  });

  it('offer the other engine, which no other surface in the app could', () => {
    const codex = rows.find((r) => r.pick.engine === 'codex');
    expect(codex).toBeTruthy();
    expect(codex.label).toBe('Model: GPT-6.1-Sol');
  });

  it('say which coding agent each one runs in', () => {
    expect(rows.map((r) => r.hint)).toEqual(expect.arrayContaining(['Codex']));
    expect(rows.every((r) => r.hint === 'Codex' || r.hint === 'Claude Code')).toBe(true);
  });

  it('leave out the model the thread is already on', () => {
    expect(rows.some((r) => r.pick.model === 'opus')).toBe(false);
  });

  it('stay short enough to sit among the other commands', () => {
    expect(rows.length).toBeLessThanOrEqual(3);
  });
});

describe('on a Codex thread', () => {
  it('the way back to Claude Code is offered', () => {
    const rows = modelCommands({ engine: 'codex', model: 'gpt-6.1-sol' }, opts);
    expect(rows.some((r) => r.pick.engine === 'claude')).toBe(true);
    expect(rows.some((r) => r.pick.model === 'gpt-6.1-sol')).toBe(false);
  });
});

describe('on a Mac with one coding agent', () => {
  it('offers that engine only, since it cannot run the other', () => {
    const rows = modelCommands({ engine: 'claude', model: 'opus' }, { ...opts, engines: CLAUDE_ONLY });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.pick.engine === 'claude')).toBe(true);
  });
});
