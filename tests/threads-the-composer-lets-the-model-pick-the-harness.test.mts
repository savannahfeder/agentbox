// THE NEW THREAD COMPOSER: CHOOSING A MODEL CHOOSES THE HARNESS.
//
// The card that replaced the one-line Compose sentence (w-e731ca9376, approved
// 2026-10-01) has no Engine field. It has a Model field, and the model decides
// where the run happens: an Anthropic model runs in Claude Code, a GPT model in
// Codex. Before this there were two pickers that had to agree, and the old card
// spent a whole comment block on the ways they came apart (a Claude alias sent
// to Codex is a run the supervisor refuses outright).
//
// So the mapping is a rule with a test, and so is the Recent list at the top of
// the Model menu: the three most recently used distinct models out of the work
// items, newest first, topped up with Opus 5.5, Sonnet 5.5 and the Codex default
// when there are fewer than three. Measured on the fixture below: five items
// carrying four distinct models give exactly three rows, in createdAt order, with
// the duplicate dropped and the Codex row left out on a Mac that offers no Codex.
import { describe, it, expect } from 'vitest';
import {
  harnessOf, recentModels, allModels, moreCount, harnessFields,
} from '../renderer/src/threads/composer-rules.ts';

const CODEX = [
  { id: 'gpt-6-astra', label: 'GPT-6-Astra', levels: ['low', 'medium', 'high'], defaultLevel: 'medium' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol', levels: ['low', 'medium'], defaultLevel: 'low' },
];
const item = (createdAt, model, engine) => ({ createdAt, ...(model ? { model } : {}), ...(engine ? { engine } : {}) });

describe('the model decides the harness', () => {
  it('sends an Anthropic alias to Claude Code', () => {
    expect(harnessOf('opus', CODEX)).toBe('claude');
    expect(harnessOf('haiku', CODEX)).toBe('claude');
  });

  it('sends a full Claude model id to Claude Code too', () => {
    expect(harnessOf('claude-opus-5-5', CODEX)).toBe('claude');
  });

  it('sends a model Codex lists to Codex', () => {
    expect(harnessOf('gpt-6-astra', CODEX)).toBe('codex');
  });

  it('sends a GPT slug Codex has not listed to Codex, not to Claude Code', () => {
    expect(harnessOf('gpt-7-new', [])).toBe('codex');
  });

  it('does not mistake a Claude model with gpt nowhere in it for Codex', () => {
    expect(harnessOf('sonnet', [])).toBe('claude');
  });
});

describe('the Recent rows', () => {
  it('are the three most recent distinct models, newest first', () => {
    const items = [
      item(100, 'sonnet', 'claude'),
      item(500, 'opus', 'claude'),
      item(400, 'gpt-6-astra', 'codex'),
      item(300, 'opus', 'claude'),
      item(200, 'haiku', 'claude'),
    ];
    expect(recentModels(items, { codexModels: CODEX, codexDefault: 'gpt-6-astra', codexOffered: true })).toEqual([
      { engine: 'claude', model: 'opus' },
      { engine: 'codex', model: 'gpt-6-astra' },
      { engine: 'claude', model: 'haiku' },
    ]);
  });

  it('read the harness off the model when the item never wrote an engine', () => {
    const rows = recentModels([item(2, 'gpt-5.6-sol'), item(1, 'claude-sonnet-5')], { codexModels: CODEX, codexDefault: null, codexOffered: true });
    expect(rows.slice(0, 2)).toEqual([
      { engine: 'codex', model: 'gpt-5.6-sol' },
      { engine: 'claude', model: 'claude-sonnet-5' },
    ]);
  });

  it('name a full Claude id by the alias the picker uses, so it is not listed twice', () => {
    const rows = recentModels([item(2, 'claude-opus-5-5'), item(1, 'opus')], { codexModels: [], codexDefault: null, codexOffered: false });
    expect(rows.filter((r) => r.model === 'opus')).toHaveLength(1);
  });

  it('skip items that named no model, since they ran on a default nobody chose', () => {
    const rows = recentModels([item(3), item(2, 'haiku')], { codexModels: [], codexDefault: null, codexOffered: false });
    expect(rows[0]).toEqual({ engine: 'claude', model: 'haiku' });
  });

  it('top up with Opus, Sonnet and the Codex default when there are fewer than three', () => {
    expect(recentModels([], { codexModels: CODEX, codexDefault: 'gpt-5.6-sol', codexOffered: true })).toEqual([
      { engine: 'claude', model: 'opus' },
      { engine: 'claude', model: 'sonnet' },
      { engine: 'codex', model: 'gpt-5.6-sol' },
    ]);
  });

  it('never offer Codex on a Mac that does not offer it, even when an old item ran there', () => {
    const rows = recentModels([item(9, 'gpt-6-astra', 'codex')], { codexModels: CODEX, codexDefault: 'gpt-6-astra', codexOffered: false });
    expect(rows.every((r) => r.engine === 'claude')).toBe(true);
    expect(rows).toHaveLength(3);
  });

  it('stop at three however many models were used', () => {
    const items = ['opus', 'sonnet', 'haiku', 'fable', 'claude-opus-5'].map((m, i) => item(i, m, 'claude'));
    expect(recentModels(items, { codexModels: [], codexDefault: null, codexOffered: false })).toHaveLength(3);
  });
});

describe('All models', () => {
  it('lists Claude Code and Codex as two columns, and Codex only when it is offered', () => {
    const both = allModels({ codexModels: CODEX, codexOffered: true });
    expect(both.claude.every((r) => r.engine === 'claude')).toBe(true);
    expect(both.codex.map((r) => r.model)).toEqual(['gpt-6-astra', 'gpt-5.6-sol']);
    expect(allModels({ codexModels: CODEX, codexOffered: false }).codex).toEqual([]);
  });

  it('counts the models that are not already in Recent', () => {
    const all = allModels({ codexModels: CODEX, codexOffered: true });
    const recent = [{ engine: 'claude', model: 'opus' }, { engine: 'codex', model: 'gpt-6-astra' }, { engine: 'claude', model: 'sonnet' }];
    expect(moreCount(recent, all)).toBe(all.claude.length + all.codex.length - 3);
  });

  it('does not subtract a Recent row that is in neither column', () => {
    const all = allModels({ codexModels: [], codexOffered: false });
    expect(moreCount([{ engine: 'claude', model: 'some-pinned-id' }], all)).toBe(all.claude.length);
  });
});

describe('what a send carries about the harness', () => {
  it('always names the Claude model, including the default', () => {
    expect(harnessFields({ engine: 'claude', model: 'opus', effort: null, engineCount: 1, codexDefault: null })).toEqual({ model: 'opus' });
  });

  it('names the engine only when this Mac offered a choice', () => {
    expect(harnessFields({ engine: 'claude', model: 'sonnet', effort: null, engineCount: 2, codexDefault: null }))
      .toEqual({ engine: 'claude', model: 'sonnet' });
  });

  it('leaves the Codex default unnamed so her own config.toml decides', () => {
    expect(harnessFields({ engine: 'codex', model: 'gpt-6-astra', effort: null, engineCount: 2, codexDefault: 'gpt-6-astra' }))
      .toEqual({ engine: 'codex' });
  });

  it('names a Codex model she moved to, and the level she picked', () => {
    expect(harnessFields({ engine: 'codex', model: 'gpt-5.6-sol', effort: 'low', engineCount: 2, codexDefault: 'gpt-6-astra' }))
      .toEqual({ engine: 'codex', model: 'gpt-5.6-sol', effort: 'low' });
  });
});
