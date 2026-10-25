// Recent skipped the model a tester had sent three threads on that morning.
//
// Power-test-2, issue 42: three Claude threads on Opus 5.5 and three Codex on
// GPT-6.1-Sol before lunch, then one-off picks of Sonnet 5.5, GPT-6-Astra and
// Fable 5.1 on replies. Recent showed GPT-6.1-Sol, Sonnet 5.5 and
// GPT-5.6-Terra. "I have to go to All models (13 more) to get Opus."
//
// Three one-off picks pushed out the model behind six threads, because the
// list was the three most recent DISTINCT models and nothing else. It is the
// ones you use now: the last one you picked, which is what Recent promises,
// and then the ones you reach for most.

import { describe, expect, it } from 'vitest';
import { recentModels } from '../renderer/src/threads/composer-rules.ts';

const CODEX = [
  { id: 'gpt-6.1-sol', label: 'GPT-6.1-Sol', levels: ['low', 'medium', 'high'], defaultLevel: 'medium' },
  { id: 'gpt-6-astra', label: 'GPT-6-Astra', levels: ['low', 'medium'], defaultLevel: 'low' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra', levels: ['low'], defaultLevel: 'low' },
];
const item = (createdAt, model, engine) => ({ createdAt, model, engine });
const opts = { codexModels: CODEX, codexDefault: 'gpt-6.1-sol', codexOffered: true };

// Her morning, in the order it happened.
const herDay = [
  ...[1, 2, 3].map((n) => item(n, 'opus', 'claude')),
  ...[4, 5, 6].map((n) => item(n, 'gpt-6.1-sol', 'codex')),
  item(7, 'sonnet', 'claude'),
  item(8, 'gpt-6-astra', 'codex'),
  item(9, 'fable', 'claude'),
];

describe('the model behind six of the morning’s threads', () => {
  const rows = recentModels(herDay, opts);

  it('is in Recent, not behind All models', () => {
    expect(rows).toContainEqual({ engine: 'claude', model: 'opus' });
  });

  it('shares the list with the other one she leans on', () => {
    expect(rows).toContainEqual({ engine: 'codex', model: 'gpt-6.1-sol' });
  });

  it('still opens on the one she picked last, which is what Recent promises', () => {
    expect(rows[0]).toEqual({ engine: 'claude', model: 'fable' });
  });

  it('is still three rows', () => {
    expect(rows).toHaveLength(3);
  });
});

describe('with nothing used twice it reads exactly as it always did', () => {
  it('newest first', () => {
    const rows = recentModels(
      [item(1, 'sonnet', 'claude'), item(2, 'gpt-6-astra', 'codex'), item(3, 'opus', 'claude')],
      opts,
    );
    expect(rows).toEqual([
      { engine: 'claude', model: 'opus' },
      { engine: 'codex', model: 'gpt-6-astra' },
      { engine: 'claude', model: 'sonnet' },
    ]);
  });
});

describe('an old favourite does not hold a row for ever', () => {
  it('falls away once the window has moved past it', () => {
    const longAgo = Array.from({ length: 30 }, (_, i) => item(i, 'haiku', 'claude'));
    const lately = Array.from({ length: 60 }, (_, i) => item(100 + i, i % 2 ? 'opus' : 'gpt-6.1-sol', i % 2 ? 'claude' : 'codex'));
    const rows = recentModels([...longAgo, ...lately], opts);
    expect(rows.some((r) => r.model === 'haiku')).toBe(false);
  });
});
