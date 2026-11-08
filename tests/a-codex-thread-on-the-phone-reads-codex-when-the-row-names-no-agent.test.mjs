// A CODEX THREAD ON THE PHONE READS CODEX WHEN ITS ROW NAMES NO AGENT.
//
// QA on 2026-11-04 (M-30, Android) found Codex threads whose reply box read
// "On Opus 5.5" with only Claude models offered, on a build that already had
// replyModel. Those rows carried no `engine`: a new thread names its agent only
// when the computer offers two, so a thread that runs on Codex because Codex is
// the computer's only or chosen agent has none, and the phone assumed Claude.
// The new-thread form also flipped from "Codex's own" to "Opus 5.5" when the
// phone's read of the computer's agents was slow or failed, because it started
// from Claude Code alone every time. These pin the computer's rule
// (shared/engines.mjs `engineFor`) on the phone and the kept copy of its agents.
import { describe, it, expect } from 'vitest';
import { replyModel, openingEngine, keptAgents, keepAgents } from '../mobile/src/lib/compose';

const both = [{ id: 'claude', label: 'Claude Code' }, { id: 'codex', label: 'Codex' }];
const codexOnly = [{ id: 'codex', label: 'Codex' }];
const claudeOnly = [{ id: 'claude', label: 'Claude Code' }];
const codexModels = [{ id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' }, { id: 'gpt-6-luna', label: 'GPT-6 Luna' }];
const agents = (engines, workspace = 'claude') => ({ engines, workspace, codexModels, codexDefault: 'gpt-6.1-sol' });
const memory = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

describe("a reply box on a row that names no agent", () => {
  it('is Codex on a computer that has only Codex', () => {
    expect(replyModel({}, {}, agents(codexOnly))).toMatchObject({ engine: 'codex', model: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' });
  });
  it("is Codex when Codex is the computer's chosen agent", () => {
    expect(replyModel({}, {}, agents(both, 'codex')).engine).toBe('codex');
  });
  it('is Claude when the computer chose Codex but no longer has it', () => {
    expect(replyModel({}, {}, agents(claudeOnly, 'codex'))).toMatchObject({ engine: 'claude', label: 'Opus 5.5' });
  });
  it('is Claude on a computer that runs Claude Code by default', () => {
    expect(replyModel({}, {}, agents(both, 'claude'))).toMatchObject({ engine: 'claude', label: 'Opus 5.5' });
  });
  it("follows the row's own agent over the computer's default", () => {
    expect(replyModel({ engine: 'claude', model: 'sonnet' }, {}, agents(both, 'codex')).engine).toBe('claude');
    expect(replyModel({ engine: 'codex' }, {}, agents(both, 'claude')).engine).toBe('codex');
  });
});

describe("the computer's agents, kept on the phone", () => {
  it('are read back as they were kept', () => {
    const store = memory();
    keepAgents(store, agents(codexOnly, 'codex'));
    expect(keptAgents(store)).toMatchObject({ engines: codexOnly, workspace: 'codex', codexDefault: 'gpt-6.1-sol' });
  });
  it('are nothing before the first read, or when the kept copy is spoiled', () => {
    expect(keptAgents(memory())).toBeNull();
    expect(keptAgents(memory({ 'agentbox.computerAgents': '{nope' }))).toBeNull();
    expect(keptAgents(memory({ 'agentbox.computerAgents': '{"engines":[]}' }))).toBeNull();
  });
});

describe('the agent a new thread opens on', () => {
  it("is Codex when Codex is the computer's chosen agent and nothing was picked", () => {
    expect(openingEngine(memory(), both, 'codex')).toBe('codex');
  });
  it('is the one picked last, over the computer\'s default', () => {
    const store = memory();
    store.setItem('zero.lastEngine', 'claude');
    expect(openingEngine(store, both, 'codex')).toBe('claude');
  });
  it('is Claude on a computer that runs Claude Code by default', () => {
    expect(openingEngine(memory(), both, 'claude')).toBe('claude');
  });
});
