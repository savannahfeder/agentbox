// Power test 2026-11-16 round 2, issues 1 and 62 (11 sightings): pick Sonnet in
// the reply box, send, and the folded box at once says Opus again; pick Sonnet
// on a Codex thread and it says GPT-6-Astra. The run that followed was on the
// model picked, so the screen was wrong, not the run. Two causes. A send clears
// the box's pick, and the folded word read the row, which only carries the new
// model once the three-second undo hold is over and the next snapshot arrives.
// And `replyOpensOn` handed back a kept pick without its engine, so a box folded
// after picking the other agent opened on the old one.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { replyOpensOn, pickOnItsWay, modelShown } from '../renderer/src/reply-pick.ts';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('a pick kept in a folded box', () => {
  it('keeps the agent it moved the thread to', () => {
    const opens = replyOpensOn({ model: 'gpt-6-astra' }, { model: 'sonnet', effort: null, engine: 'claude' });
    expect(opens).toEqual({ pick: { model: 'sonnet', effort: null, engine: 'claude' }, touched: true });
  });

  it('carries no agent when the pick never crossed', () => {
    expect(replyOpensOn({ model: 'opus' }, { model: 'sonnet', effort: 'high' }).pick).toEqual({ model: 'sonnet', effort: 'high' });
  });
});

describe('a reply still on its way', () => {
  const sent = { at: 1, text: 'go on', pick: { model: 'sonnet', effort: null } };

  it('lends the box the pick it went with', () => {
    expect(pickOnItsWay([sent])).toEqual({ model: 'sonnet', effort: null });
  });

  it('lends the newest pick when two went', () => {
    expect(pickOnItsWay([sent, { at: 2, text: 'and this', pick: { model: 'fable', effort: null } }])?.model).toBe('fable');
  });

  it('lends nothing when the reply went without touching the model', () => {
    expect(pickOnItsWay([{ at: 1, text: 'go on' }])).toBeNull();
    expect(pickOnItsWay([])).toBeNull();
    expect(pickOnItsWay(undefined)).toBeNull();
  });

  it('lends nothing when the Mac turned the reply down', () => {
    expect(pickOnItsWay([{ ...sent, refused: 'offline' }])).toBeNull();
  });

  it('opens the box on it, without counting as a new pick', () => {
    expect(replyOpensOn({ model: 'opus' }, null, { model: 'sonnet', effort: null, engine: 'claude' }))
      .toEqual({ pick: { model: 'sonnet', effort: null, engine: 'claude' }, touched: false });
  });

  it('gives way to a pick she has made since', () => {
    expect(replyOpensOn({ model: 'opus' }, { model: 'fable', effort: null }, { model: 'sonnet', effort: null }).pick.model).toBe('fable');
  });
});

describe('the folded box names', () => {
  it('the model the reply went with while the row still has the old one', () => {
    expect(modelShown({ model: 'opus' }, 'claude', [{ at: 1, text: 'x', pick: { model: 'sonnet', effort: null } }]))
      .toEqual({ engine: 'claude', model: 'sonnet' });
  });

  it('the agent a reply moved the thread to', () => {
    expect(modelShown({ model: 'gpt-6-astra' }, 'codex', [{ at: 1, text: 'x', pick: { model: 'sonnet', effort: null, engine: 'claude' } }]))
      .toEqual({ engine: 'claude', model: 'sonnet' });
  });

  it("the row's own once nothing is on its way", () => {
    expect(modelShown({ model: 'opus' }, 'claude', [])).toEqual({ engine: 'claude', model: 'opus' });
    expect(modelShown({ model: '' }, null, undefined)).toEqual({ engine: null, model: null });
  });
});

describe('the app wires it', () => {
  it('records the pick on every reply it draws as sending', () => {
    const app = read('renderer/src/App.tsx');
    const mines = app.match(/const mine = \{ product: item\.product, id: item\.id, at[^\n]*, text, held[^\n]*/g) ?? [];
    expect(mines.length).toBe(2);
    for (const line of mines) expect(line).toMatch(/\bpick\b/);
  });

  it('draws the folded word and opens the box through the pick on its way', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toMatch(/modelShown\(item, runningEngine \?\? null, sending\)/);
    expect(focus).toMatch(/replyOpensOn\(item, readDraftPick\(item\), onItsWay\)/);
  });
});
