// A REPLY COULD NOT MOVE A THREAD TO THE OTHER CODING AGENT.
//
// The power test of 2026-10-20 was asked to lean on switching between Claude
// Code and Codex. The reply box's model menu listed only the thread's own
// agent, with no word why: on a Claude thread the eight Claude models, on a
// Codex thread the six GPT ones. Two testers hit it eight times, including on
// the one thread that most needed to move, where Claude Code had refused to
// start at all (run 2, issues 1 and 9).
//
// The reply box now opens the card's own menu: the few models you use, each
// wearing its agent, then All models, then the effort strip. Picking the other
// agent's model moves the thread, which the session cannot follow, so the next
// run starts fresh and the box says so before you send.
//
// The store half of this landed first, from ⌘K (w-c9da359466, and
// tests/a-thread-can-be-carried-on-in-the-other-engine). What is measured here
// is the menu's half: a pick that crosses names the agent on the send, a pick
// that stays says nothing, and the row the store leaves behind is one the real
// resolver spawns on the other agent.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import * as disk from '../main/store/work-items.mjs';
import { ENGINE_CHOICE_ENABLED, engineFor, modelForEngine } from '../shared/engines.mjs';
import { pickToSend } from '../renderer/src/reply-pick';

describe('what a reply says about the agent it runs on', () => {
  const two = { engineCount: 2 };

  it('names the agent when the pick crosses to the other one', () => {
    expect(pickToSend({ model: 'gpt-5.6-terra', effort: null }, { engine: 'codex', was: 'claude', ...two }))
      .toEqual({ engine: 'codex', model: 'gpt-5.6-terra', effort: null });
  });

  it('leaves the agent alone when the pick stays on this one', () => {
    const out = pickToSend({ model: 'sonnet', effort: 'high' }, { engine: 'claude', was: 'claude', ...two });
    expect(out).toEqual({ model: 'sonnet', effort: 'high' });
    expect('engine' in out).toBe(false);
  });

  // THE CASE THAT MUST NOT MATCH: one coding agent is no choice, so a reply
  // there says nothing about agents at all, exactly as it always did.
  it('never names the agent on a Mac with one', () => {
    const out = pickToSend({ model: 'opus', effort: null }, { engine: 'claude', was: 'claude', engineCount: 1 });
    expect('engine' in out).toBe(false);
  });

  // And never from a caller that does not know what the row is on, which is
  // every caller but the reply box.
  it('never names the agent without the row\'s own to compare', () => {
    expect('engine' in pickToSend({ model: 'opus', effort: null }, { engine: 'claude' })).toBe(false);
  });

  // The model rule either side of the move is unchanged: Codex's own default
  // is the absence of a word, and Claude Code always names one.
  it('keeps the model rule it already had', () => {
    expect(pickToSend({ model: null, effort: null }, { engine: 'codex', was: 'claude', ...two }).model).toBe(null);
    expect(pickToSend({ model: null, effort: null }, { engine: 'claude', was: 'codex', ...two }).model).toBe('opus');
  });
});

describe('the store takes the agent with the reply', () => {
  let root, dir, store, id;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-agent-'));
    dir = path.join(root, 'project');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'project', name: 'Project' }));
    store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [] }).init();
    id = store.composeItem('project', { title: 'Check the release', body: 'Check it.', model: 'opus', engine: 'claude' }).id;
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  // The ledger as written, in the order it was appended.
  const ledger = () => disk.readLinesFrom(dir).lines
    .map((l) => (typeof l === 'string' ? JSON.parse(l) : l))
    .filter((l) => l.id === id);

  it('moves the thread and clears the model the other agent cannot run', () => {
    store.answerItem('project', id, { answer: 'Same task, with Codex.', engine: 'codex', model: null });
    const row = store.readItem('project', id);
    expect(row.engine).toBe('codex');
    expect(row.model).toBe('');
    expect(row.answer).toBe('Same task, with Codex.');
  });

  it('writes the agent before the answer, so the run it starts reads the new one', () => {
    store.answerItem('project', id, { answer: 'Same task, with Codex.', engine: 'codex', model: null });
    const lines = ledger();
    const agentAt = lines.findIndex((l) => l.patch && 'engine' in l.patch && l.patch.engine === 'codex');
    const answerAt = lines.findIndex((l) => l.patch && 'answer' in l.patch);
    expect(agentAt).toBeGreaterThanOrEqual(0);
    expect(answerAt).toBeGreaterThan(agentAt);
  });

  it('leaves the agent alone on a reply that does not name one', () => {
    store.answerItem('project', id, { answer: 'Carry on.' });
    expect(store.readItem('project', id).engine).toBe('claude');
  });

  // THE FACT THE WHOLE CHANGE RESTS ON, asked of the real resolver the
  // supervisor spawns through rather than of the field: the next run goes to
  // the agent the reply named, and the model it was on does not go with it.
  it('is the agent the next run spawns on, and the old model does not cross', () => {
    store.answerItem('project', id, { answer: 'Same task, with Codex.', engine: 'codex', model: null });
    const row = store.readItem('project', id);
    const found = { claude: true, codex: true };
    const config = { engineChoice: row.wrote.engine.ts - 1 };
    expect(engineFor(row, { config, found, enabled: ENGINE_CHOICE_ENABLED })).toBe('codex');
    // The Claude alias is off the row, so the Codex spawn is handed no model
    // at all rather than a word Codex would refuse (`codexModelRefusal`).
    expect(modelForEngine(row, 'codex')).toBe(null);
  });
});

describe('the reply box draws the card\'s own menu', () => {
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  const ipc = fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../renderer/src/api.ts', import.meta.url), 'utf8');

  it('uses the one menu component rather than a second drawer', () => {
    const reply = fs.readFileSync(new URL('../renderer/src/components/ReplyModel.tsx', import.meta.url), 'utf8');
    const card = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
    expect(focus).toContain('<ReplyModel');
    expect(focus).not.toContain('<ModelPicker');
    // Both boxes draw the same menu, so the lists cannot drift apart.
    expect(reply).toContain('<ModelMenu');
    expect(card).toContain('<ModelMenu');
  });

  it('carries the agent from the box to the store', () => {
    expect(api).toMatch(/engine\?: string \| null/);
    expect(ipc).toMatch(/zero:answer[\s\S]{0,400}engine/);
  });
});
