// AN OLD CODEX THREAD ON THE PHONE READS CODEX'S OWN, NOT A CLAUDE MODEL.
//
// QA batch 014 (M-36, M-47, Android, 2026-11-07 to 11-11): older Codex threads
// carried `model: "opus"` from before the phone knew a thread's agent. The reply
// box read "On opus." and its picker offered one row, the raw word "opus". The
// computer ran Codex with "opus" and stopped: "Codex could not use this task's
// model on that account's plan". Measured by calling replyModel and
// replyChoices with that row on a Codex-only computer.
import { describe, it, expect } from 'vitest';
import { replyModel, replyChoices } from '../mobile/src/lib/compose';
import { engineModelChoices } from '../renderer/src/models';

const codexOnly = [{ id: 'codex' as const, label: 'Codex' }];
const both = [{ id: 'claude' as const, label: 'Claude Code' }, { id: 'codex' as const, label: 'Codex' }];
const codexModels = [{ id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' }, { id: 'gpt-6-luna', label: 'GPT-6 Luna' }];
const agents = (engines: typeof both | typeof codexOnly, codexDefault: string | null = null) => ({ engines: [...engines], workspace: 'codex', codexModels, codexDefault });

describe('a Codex thread whose row carries a Claude model', () => {
  it("reads Codex's own, and its picker lists Codex's models", () => {
    const r = replyModel({ model: 'opus' }, {}, agents(codexOnly));
    expect(r).toMatchObject({ engine: 'codex', label: "Codex's own" });
    expect(engineModelChoices(r.engine, r.model, agents(codexOnly)).map((m) => m.label)).toEqual(['GPT-6.1 Sol', 'GPT-6 Luna', "Codex's own"]);
  });
  it("reads the computer's Codex default when it has one", () => {
    expect(replyModel({ engine: 'codex', model: 'claude-opus-5-5' }, {}, agents(both, 'gpt-6.1-sol')).label).toBe('GPT-6.1 Sol');
  });
  it('clears the Claude model when a reply is sent without a pick, so Codex can run', () => {
    expect(replyChoices({ model: 'opus' }, {}, agents(codexOnly))).toEqual({ model: null });
    expect(replyChoices({ engine: 'codex', model: 'sonnet' }, { priority: 3 }, agents(both))).toEqual({ priority: 3, model: null });
  });
  it('sends the model picked in the box', () => {
    expect(replyChoices({ model: 'opus' }, { model: 'gpt-6-luna' }, agents(codexOnly))).toEqual({ model: 'gpt-6-luna' });
  });
});

describe('rows that must not change', () => {
  it('a Codex thread keeps its own Codex model, and sends nothing for it', () => {
    expect(replyModel({ engine: 'codex', model: 'gpt-6-luna' }, {}, agents(both)).label).toBe('GPT-6 Luna');
    expect(replyChoices({ engine: 'codex', model: 'gpt-6-luna' }, {}, agents(both))).toEqual({});
  });
  it('a Codex thread keeps a slug the phone does not know', () => {
    expect(replyModel({ engine: 'codex', model: 'my-tuned-model' }, {}, agents(both)).model).toBe('my-tuned-model');
  });
  it('a Claude thread keeps its Claude model', () => {
    expect(replyModel({ engine: 'claude', model: 'sonnet' }, {}, agents(both))).toMatchObject({ engine: 'claude', model: 'sonnet' });
    expect(replyChoices({ engine: 'claude', model: 'sonnet' }, {}, agents(both))).toEqual({});
  });
});
