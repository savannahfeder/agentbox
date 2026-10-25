// "Picking High effort on a reply leaves no trace: the footer only says 'On
// Opus 5.5.'... so I sent it not knowing if High stuck" (power test
// w-811757c0b5 run 2, issue 45). The same tester had already logged the other
// end of it, twice, with a different thread: "Codex reply shows effort Low
// though the thread was sent at Medium. I can't tell whether my reply will run
// at Low or whether the first run already did" (issues 14 and 35).
//
// The level was readable in one place only, lit inside the drawer, which is
// shut while you read the footer and decide to send. So the footer says it,
// AND ONLY WHEN THERE IS SOMETHING TO SAY: a level nobody set is the engine's
// own choice for the model, the drawer lights that already, and a word on the
// resting line for every thread is the clutter the chip was taken off this
// footer for in August.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { effortSaid } from '../renderer/src/reply-pick.ts';

const ASTRA = {
  id: 'gpt-6-astra', label: 'GPT-6-Astra',
  levels: ['low', 'medium', 'high', 'xhigh'], defaultLevel: 'low',
};
const codex = { engine: 'codex', codexModels: [ASTRA], codexDefault: 'gpt-6-astra' };

describe('the footer says the level the next send will run at', () => {
  it('says the level she picked on this reply', () => {
    expect(effortSaid({ model: 'opus', effort: 'high' }, { engine: null })).toBe('High');
  });

  it('says the level the thread was sent at, so a reply cannot disagree with it', () => {
    // Read off the row, which is where the new task card wrote it.
    expect(effortSaid({ model: null, effort: 'medium' }, codex)).toBe('Medium');
  });

  it('says nothing when nobody has set a level', () => {
    // The engine chooses for the model and the drawer lights its choice. The
    // footer does not claim it, because nothing is sent.
    expect(effortSaid({ model: 'opus', effort: null }, { engine: null })).toBeNull();
    expect(effortSaid({ model: null, effort: '' }, codex)).toBeNull();
  });

  it('says nothing about a level this model does not take', () => {
    // A remembered `ultra` on a model that stops at xhigh is not sent, so the
    // footer must not promise it. Codex refuses a level a model does not
    // advertise.
    expect(effortSaid({ model: 'gpt-6-astra', effort: 'ultra' }, codex)).toBeNull();
  });

  it('names the level in the words the drawer uses', () => {
    expect(effortSaid({ model: 'opus', effort: 'xhigh' }, { engine: null })).toBe('Extra');
  });
});

describe('the clause is in the reply footer and nowhere else', () => {
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  const compose = fs.readFileSync(new URL('../renderer/src/components/Compose.tsx', import.meta.url), 'utf8');

  it('ends the reply sentence with the model and then the level', () => {
    const dock = focus.slice(focus.indexOf('function DockComposer'));
    expect(dock).toContain('effortSaid(');
  });

  it('leaves the new task card the one sentence she settled on', () => {
    // "The one thing she ruled out was more words on the line" (Model.tsx,
    // 2026-09-01). The card opens carrying a remembered level on every single
    // card, so a clause there would be permanent furniture; the reply box only
    // ever shows one that this thread is really set to.
    expect(compose).not.toContain('effortSaid(');
  });
});
