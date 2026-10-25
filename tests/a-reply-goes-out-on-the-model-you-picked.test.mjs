// Two testers, 45 minutes, and the reply box lost the model four separate
// times (power test w-811757c0b5 run 2, issues 10, 18 and 3). "Every thread
// where I change the model on a reply ends up showing no model."
//
// Both halves of that are one line of arithmetic. `answerItem` stores "nothing
// chosen" as the EMPTY STRING, because `modelForEngine` reads '' as nothing and
// a JSON null would need a special case in both engines' argv builders. The
// reply box read that back with `item.model ?? null`, and `??` does not catch
// '', so '' became the model id: `modelChoices('')` has no row for it, invents
// `{ id: '', label: '' }`, and the footer renders "On ." with a model word nought
// pixels wide. The folded pill drew `modelWord &&` and so drew nothing at all.
//
// And the '' got there by being PICKED. `ModelPicker` reports the engine's
// default as null (that is what keeps the new-task card's footer shut), the
// reply box sent that null straight through, and the store read it as "clear
// it". So choosing Opus 5.5 on a thread running Fable did not pin Opus: it
// unpinned Fable and let whatever `--model` sits in zero.config.json take the
// turn. Three of the testers' four sightings were exactly that, because Opus
// 5.5 is the Claude default.
//
// Measured against the real `answerItem` on a recording disk, the way
// changing-the-model-of-a-conversation.test.mjs does, plus the picker rendered
// for real with react-dom/server.

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Store } from '../main/store.mjs';
import { pickOnTheRow, pickToSend, replyOpensOn } from '../renderer/src/reply-pick.ts';
import { ModelPicker } from '../renderer/src/components/Model.tsx';
import { DEFAULT_MODEL } from '../renderer/src/models.ts';

function answer(start, patch) {
  let item = { id: 'w-abcdef', status: 'open', ...start };
  const disk = {
    readWorkItem: () => item,
    updateWorkItem: (_dir, _id, fields) => (item = { ...item, ...fields }),
  };
  const store = { modules: { workItemsDisk: disk }, productDir: () => '/fixture' };
  Store.prototype.answerItem.call(store, 'p', item.id, patch);
  return item;
}

const CODEX = [{ id: 'gpt-6-astra', label: 'GPT-6-Astra', levels: ['low', 'medium', 'high'], defaultLevel: 'low' }];

describe("the store's empty string is nothing chosen, not a model called ''", () => {
  it('reads a cleared model as no pick', () => {
    expect(pickOnTheRow({ model: '', effort: '' })).toEqual({ model: null, effort: null });
  });

  it('keeps a model that is really on the row', () => {
    expect(pickOnTheRow({ model: 'fable', effort: 'high' })).toEqual({ model: 'fable', effort: 'high' });
  });

  it('reads a row that was never given one as no pick', () => {
    expect(pickOnTheRow({})).toEqual({ model: null, effort: null });
    expect(pickOnTheRow(null)).toEqual({ model: null, effort: null });
  });

  it('draws a model name for a cleared row instead of an empty word', () => {
    // THE SHOT IN THE REPORT. The footer read "On ." and the tester could not
    // click what was not there: an empty label is a button with no width.
    const html = renderToStaticMarkup(React.createElement(ModelPicker, {
      value: pickOnTheRow({ model: '' }).model, onChange: () => {},
    }));
    expect(html).toContain('Opus');
    expect(html).not.toMatch(/<button[^>]*class="compose-word[^"]*"[^>]*><\/button>/);
  });

  it("still draws Codex's own on a Codex row with nothing chosen", () => {
    const html = renderToStaticMarkup(React.createElement(ModelPicker, {
      value: pickOnTheRow({ model: '' }).model, onChange: () => {}, engine: 'codex', codexModels: CODEX,
    }));
    // The apostrophe comes back as an entity from the static renderer.
    expect(html.replace(/&#x27;/g, "'")).toContain("Codex's own");
  });
});

describe('picking the default pins it, rather than clearing the row', () => {
  it('sends the Claude default as itself', () => {
    // The drawer says null for the row it lights by default, which on Claude
    // Code is Opus. Sent as null it UNPINS the model.
    expect(pickToSend({ model: null, effort: null }, { engine: null }).model).toBe(DEFAULT_MODEL);
  });

  it('sends a model she moved to as itself', () => {
    expect(pickToSend({ model: 'fable', effort: 'high' }, { engine: null }))
      .toEqual({ model: 'fable', effort: 'high' });
  });

  it("leaves a Codex reply on Codex's own when that is what she picked", () => {
    // Codex has no alias to pin: with nothing chosen her config.toml decides,
    // which is what the new-task card does too (Compose.tsx).
    expect(pickToSend({ model: null, effort: null }, { engine: 'codex' }).model).toBeNull();
    expect(pickToSend({ model: 'gpt-6-astra', effort: 'high' }, { engine: 'codex' }).model).toBe('gpt-6-astra');
  });

  it('carries the level through untouched, including a clear', () => {
    expect(pickToSend({ model: 'fable', effort: null }, { engine: null }).effort).toBeNull();
    expect(pickToSend({ model: 'fable', effort: 'xhigh' }, { engine: null }).effort).toBe('xhigh');
  });

  it('leaves Opus on the row, where the next run reads it', () => {
    // The whole bug, end to end: a Fable thread, she picks Opus 5.5, and the
    // row must say opus afterwards rather than nothing.
    const sent = pickToSend({ model: null, effort: null }, { engine: null });
    const item = answer({ model: 'fable' }, { answer: 'carry on', ...sent });
    expect(item.model).toBe('opus');
  });

  it("clears a Codex row back to her config when she picks Codex's own", () => {
    const sent = pickToSend({ model: null, effort: null }, { engine: 'codex' });
    expect(answer({ model: 'gpt-6-astra' }, { answer: 'carry on', ...sent }).model).toBe('');
  });
});

describe('what the box opens on', () => {
  it("takes the row's own model when she has picked nothing yet", () => {
    expect(replyOpensOn({ model: 'fable', effort: 'high' }, null))
      .toEqual({ pick: { model: 'fable', effort: 'high' }, touched: false });
  });

  it('takes the pick she left in the box over the row', () => {
    expect(replyOpensOn({ model: 'fable', effort: null }, { model: 'opus', effort: 'high' }))
      .toEqual({ pick: { model: 'opus', effort: 'high' }, touched: true });
  });

  it("counts a kept pick of the engine's own as a pick", () => {
    // `null` inside a kept pick is her choice of the default, not the absence
    // of one, so it must not fall through to the row's model.
    expect(replyOpensOn({ model: 'fable', effort: 'high' }, { model: null, effort: null }))
      .toEqual({ pick: { model: null, effort: null }, touched: true });
  });
});
