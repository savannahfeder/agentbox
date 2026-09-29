// THE FOOTER NAMES THE HARNESS FIRST AND THE MODEL SECOND.
//
// The card used to read "For Agentbox. Low priority. Starts now. On Opus 5.
// With Claude Code.", and that order was reported as wrong (w-83b8bfdcd3): the
// harness determines the model, so it cannot be chosen after it.
//
// It is not a preference about word order. The dependency is already in the
// code: `pickEngine` in Compose.tsx throws the model away and restores the new
// engine's own last pick, because Claude Code and Codex share no model names at
// all. So the old sentence put the dependent word first and then overwrote it
// with the next one she touched. Reversed, the sentence reads in the order the
// choices actually resolve: pick the harness, then pick out of that harness's
// models.
//
// What is asserted here is the ORDER in the rendered line, not the presence of
// either word, because presence is already covered:
// tests/one-coding-agent-draws-nothing-new.test.mjs owns "no engine clause on a
// one-engine Mac", and tests/a-new-chat-uses-the-workspace-agent.test.mjs owns
// which word each clause opens carrying.

import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Compose } from '../renderer/src/components/Compose.tsx';
import { ENGINES } from '../shared/engines.mjs';

const saved = globalThis.localStorage;
afterEach(() => { globalThis.localStorage = saved; });

function storage(entries = []) {
  const data = new Map(entries);
  return (globalThis.localStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  });
}

const card = (engineChoices = ENGINES) => renderToStaticMarkup(createElement(Compose, {
  products: [{ slug: 'test', name: 'Test' }],
  personal: [], hidden: [],
  onSend() {}, onReorder() {}, onHide() {}, onClose() {},
  engineChoices,
}));

// The rendered line with every tag taken out, which is what she reads.
const sentence = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

describe('the sentence names the harness before the model', () => {
  it('puts the engine clause ahead of the model clause in the markup', () => {
    storage();
    const html = card();
    expect(html).toContain('clause-engine');
    expect(html.indexOf('clause-engine')).toBeLessThan(html.indexOf('clause-model'));
  });

  it('reads "With Claude Code. On Opus 5." and not the other way round', () => {
    storage();
    const line = sentence(card());
    expect(line).toContain('With Claude Code. On Opus 5.');
    expect(line).not.toContain('On Opus 5. With Claude Code.');
  });

  // The punctuation moved with the clauses. The engine clause used to carry the
  // leading space (" With ") because it followed a full stop; now it follows
  // the clock and is followed by the model, so the space is on its own tail.
  it('keeps one space between the two clauses and no double space', () => {
    storage();
    const line = sentence(card());
    expect(line).not.toMatch(/ {2}/);
    expect(line).toMatch(/Starts now\. With Claude Code\. On Opus 5\./);
  });

  // A Mac with one coding agent draws no engine clause at all, so the model
  // clause is still the end of the line and nothing about it moved.
  it('still ends on the model when there is no harness to choose', () => {
    storage();
    const line = sentence(card([ENGINES[0]]));
    expect(line).toContain('On Opus 5.');
    expect(line).not.toContain('With ');
  });
});
