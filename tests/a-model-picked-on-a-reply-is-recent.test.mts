// A model picked on a reply never reached Recent.
//
// Reported 2026-11-10: "I used Fable 5.2 just now and it's still showing these
// as recent" over a menu reading Opus 5.5, Sonnet 5.5, GPT-6-Astra. Fable had
// been picked on a reply in a thread started earlier. `recentModels` ordered
// threads by `createdAt`, so that pick was dated to the thread's start: it was
// neither the newest pick nor inside a busy window. The pick's own time is on
// the row as `wrote.model.ts`, and that is what Recent now reads.

import { describe, expect, it } from 'vitest';
import { recentModels } from '../renderer/src/threads/composer-rules.ts';

const CODEX = [{ id: 'gpt-6-astra', label: 'GPT-6-Astra', levels: ['low'], defaultLevel: 'low' }];
const opts = { codexModels: CODEX, codexDefault: 'gpt-6-astra', codexOffered: true };
const thread = (createdAt: number, model: string, engine: string, pickedAt?: number) => ({
  createdAt, model, engine, ...(pickedAt ? { wrote: { model: { ts: pickedAt, source: 'founder' } } } : {}),
});

describe('a model picked on a reply in an older thread', () => {
  const items = [
    thread(1, 'fable', 'claude', 100),
    thread(2, 'gpt-6-astra', 'codex'),
    thread(3, 'sonnet', 'claude'),
    thread(4, 'opus', 'claude'),
  ];

  it('is first in Recent, because it was the last one picked', () => {
    expect(recentModels(items, opts)[0]).toEqual({ engine: 'claude', model: 'fable' });
  });

  it('counts even when the thread is older than the whole window', () => {
    const busy = Array.from({ length: 60 }, (_, i) => thread(10 + i, i % 2 ? 'opus' : 'sonnet', 'claude'));
    expect(recentModels([thread(1, 'fable', 'claude', 1000), ...busy], opts)[0]).toEqual({ engine: 'claude', model: 'fable' });
  });
});

describe('what must not move', () => {
  it('a model set when the thread was started is dated by the thread', () => {
    const rows = recentModels([thread(5, 'fable', 'claude', 5), thread(9, 'opus', 'claude')], opts);
    expect(rows[0]).toEqual({ engine: 'claude', model: 'opus' });
  });

  it('a reply pick older than a newer thread does not jump ahead of it', () => {
    const rows = recentModels([thread(1, 'fable', 'claude', 50), thread(60, 'opus', 'claude')], opts);
    expect(rows[0]).toEqual({ engine: 'claude', model: 'opus' });
  });
});
