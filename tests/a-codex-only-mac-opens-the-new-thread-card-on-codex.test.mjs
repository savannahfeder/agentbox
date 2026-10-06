// A CODEX-ONLY MAC OPENS THE NEW THREAD CARD ON CODEX.
//
// Found driving the real app on a Mac with only Codex (w-db6f5e331e,
// 2026-10-05): the app offered Codex and only Codex (snapshot engines.choices
// was [codex]), and the new thread card still opened reading "Model: Opus
// 5.5". The card took its starting engine from what had been picked last, and
// with nothing picked yet that fell through to Claude Code without asking
// whether this Mac has it.
//
// The rule: a remembered pick this Mac offers wins; otherwise Claude Code if
// this Mac has it, else Codex.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { startingEngine } from '../renderer/src/engines';
import { allModels, recentModels } from '../renderer/src/threads/composer-rules';

const CLAUDE = { id: 'claude', label: 'Claude Code', word: 'Claude Code' };
const CODEX = { id: 'codex', label: 'Codex', word: 'Codex' };

describe('the engine a new thread card opens on', () => {
  it('is Codex on a Mac that offers only Codex, with nothing picked yet', () => {
    expect(startingEngine(null, [CODEX])).toBe('codex');
  });
  it('is Codex there even when an old pick says Claude Code', () => {
    expect(startingEngine('claude', [CODEX])).toBe('codex');
  });
  it('is Claude Code on a Mac with both and nothing picked', () => {
    expect(startingEngine(null, [CLAUDE, CODEX])).toBe('claude');
  });
  it('keeps a Codex pick on a Mac with both', () => {
    expect(startingEngine('codex', [CLAUDE, CODEX])).toBe('codex');
  });
  it('is Claude Code on a Mac that offers only Claude Code, whatever was picked', () => {
    expect(startingEngine('codex', [CLAUDE])).toBe('claude');
  });
  it('is Claude Code when the list is not known yet', () => {
    expect(startingEngine(null, undefined)).toBe('claude');
    expect(startingEngine(null, [])).toBe('claude');
  });
  it('is what the card uses, and it lists no Claude model where Claude Code is not offered', () => {
    const card = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
    expect(card).toMatch(/recentModels\(items, \{ codexModels, codexDefault, codexOffered, claudeOffered \}\)/);
    expect(card).toMatch(/allModels\(\{ codexModels, codexOffered, claudeOffered \}\)/);
    // Seen in the real app: All models drew an empty CLAUDE CODE heading
    // beside the Codex list. A column is drawn only when it has rows.
    expect(card).toMatch(/\{every\.claude\.length > 0 && \(/);
    expect(card).toMatch(/\{every\.codex\.length > 0 && \(/);
  });
});

describe('the model menu on a Codex-only Mac', () => {
  const codexModels = [{ id: 'gpt-5.5', label: 'GPT-5.5' }, { id: 'gpt-5.5-mini', label: 'GPT-5.5 mini' }];
  it('offers Codex models and no Claude model', () => {
    const all = allModels({ codexModels, codexOffered: true, claudeOffered: false });
    expect(all.claude).toEqual([]);
    expect(all.codex.map((p) => p.model)).toEqual(['gpt-5.5', 'gpt-5.5-mini']);
    const recent = recentModels([], { codexModels, codexDefault: 'gpt-5.5', codexOffered: true, claudeOffered: false });
    expect(recent.every((p) => p.engine === 'codex')).toBe(true);
    expect(recent.length).toBeGreaterThan(0);
  });
  it('skips a Claude model somebody used before, there', () => {
    const recent = recentModels([{ createdAt: 2, model: 'opus', engine: 'claude' }], { codexModels, codexDefault: 'gpt-5.5', codexOffered: true, claudeOffered: false });
    expect(recent.map((p) => p.engine)).not.toContain('claude');
  });
  it('still offers Claude models everywhere else', () => {
    expect(allModels({ codexModels, codexOffered: true }).claude.length).toBeGreaterThan(0);
    expect(recentModels([], { codexModels, codexOffered: true }).some((p) => p.engine === 'claude')).toBe(true);
  });
});

describe('the card', () => {
  it('opens on startingEngine', () => {
    const card = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
    expect(card).toMatch(/startingEngine\(readLastEngine\(\), engines\)/);
  });
});
