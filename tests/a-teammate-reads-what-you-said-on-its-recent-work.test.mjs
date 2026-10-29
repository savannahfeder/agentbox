// A TEAMMATE READS WHAT YOU SAID ON ITS RECENT WORK, IN YOUR WORDS.
//
// On 2026-10-27 the person wrote on a teammate's run: "I don't know why this
// keeps coming up again and again ... It's arrived in my inbox, I swear to God,
// four or five times." Each run of a teammate is a new session, and nothing
// carried the person's replies on its earlier runs into the next one except
// what the teammate chose to save, in 300 characters. A fresh thread the
// person replies on keeps every word, which is why fresh threads did better.
//
// Now every run is handed the record of its recent work, read off the ledger
// rather than written by the teammate: each run's title, what the person said
// on it word for word, and the first line of what it answered.
import { describe, it, expect } from 'vitest';
import { recordOf } from '../shared/teammates.mjs';

const NOW = new Date(2026, 9, 29, 9, 0).getTime();
const DAY = 86_400_000;
const T = 't-27e51e1609';
const run = (id, title, ago, extra = {}) => ({
  id, product: 'site', title, labels: ['founder', `teammate:${T}`, 'hop:0', ...(extra.labels ?? [])],
  status: extra.status ?? 'done', createdAt: NOW - ago * DAY, updatedAt: NOW - ago * DAY,
});

describe('the record of a teammate\'s recent work', () => {
  const turns = {
    'w-1': [
      { source: 'system', field: 'body', text: 'One of your duties: propose the day\'s post.' },
      { source: 'agent', field: 'result', text: '**Two posts for today.**\n\nHere they are.' },
      { source: 'founder', field: 'answer', text: 'rejected, no more suggestions for a week' },
      { source: 'agent', field: 'result', text: '**Both posts are dead.**\n\nNothing until Wednesday.' },
    ],
    'w-2': [
      { source: 'founder', field: 'body', text: 'Give me hooks for the launch.' },
      { source: 'agent', field: 'result', text: '**Five hooks.**' },
    ],
    'w-3': [{ source: 'agent', field: 'result', text: 'Checked the queue, nothing to bring.' }],
  };
  const read = (product, id) => turns[id] ?? [];

  it('quotes every word you said on a run, and the first line of its last answer', () => {
    const text = recordOf([run('w-1', 'Propose the day\'s post', 1)], read, { now: NOW });
    expect(text).toContain('Propose the day\'s post');
    expect(text).toContain('You: "rejected, no more suggestions for a week"');
    expect(text).toContain('It said: "Both posts are dead."');
    expect(text).not.toContain('Two posts for today');
  });

  it('counts what you wrote to open a run as yours, and the app\'s opening as not', () => {
    const text = recordOf([run('w-2', 'Hooks', 2), run('w-1', 'Post', 1)], read, { now: NOW });
    expect(text).toContain('You: "Give me hooks for the launch."');
    expect(text).not.toContain('You: "One of your duties');
  });

  it('leaves out a quiet run you never spoke on, and keeps one you did', () => {
    const text = recordOf([run('w-3', 'Trend watch', 1, { labels: ['clean'] }), run('w-1', 'Post', 1)], read, { now: NOW });
    expect(text).not.toContain('Trend watch');
    expect(text).toContain('Post');
  });

  it('puts the newest last and drops runs older than three weeks', () => {
    const text = recordOf([run('w-1', 'Newer', 1), run('w-2', 'Older', 3), run('w-9', 'Ancient', 22)], read, { now: NOW });
    expect(text.indexOf('Older')).toBeLessThan(text.indexOf('Newer'));
    expect(text).not.toContain('Ancient');
  });

  it('a run from exactly three weeks ago is still in it', () => {
    expect(recordOf([run('w-2', 'Edge', 21)], read, { now: NOW })).toContain('Edge');
  });

  it('keeps within its budget by dropping the oldest runs first, and says so', () => {
    const many = Array.from({ length: 30 }, (_, i) => run(`w-1-${i}`, `Run ${i}`, 20 - i * 0.5));
    const big = (p, id) => [{ source: 'founder', field: 'answer', text: `${id} ${'said a lot '.repeat(80)}` }];
    const text = recordOf(many, big, { now: NOW, cap: 6000 });
    expect(text.length).toBeLessThanOrEqual(6200);
    expect(text).toContain('Run 29');
    expect(text).not.toContain('"Run 0"');
    expect(text).toMatch(/older runs left out/);
  });

  it('says a run is still waiting on you', () => {
    const waiting = { ...run('w-1', 'Post', 0), status: 'open', wrote: { result: { ts: NOW - 1000, source: 'agent' } } };
    expect(recordOf([waiting], read, { now: NOW })).toMatch(/waiting on you/);
  });

  it('is empty when there is nothing to show', () => {
    expect(recordOf([], read, { now: NOW })).toBe('');
  });
});
