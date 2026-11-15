// A CODEX THREAD'S REPLY BOX SHOWS AND OFFERS CODEX MODELS.
//
// The 2026-11-02 phone workday found that a thread running on Codex had a reply
// box reading "Opus 5.5", and its model list offered only Claude models: the
// box read `item.model ?? DEFAULT_MODEL` and named it by Claude's table alone.
// The reply box now takes the thread's own agent (replyModel in
// mobile/src/lib/compose.ts), and these pin it: a Codex thread by its mark or
// by a Codex model, a Codex thread with no model, and the Claude thread that
// must stay as it was.
import { describe, it, expect } from 'vitest';
import { replyModel } from '../mobile/src/lib/compose';

const codex = { codexModels: [{ id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' }, { id: 'gpt-6-luna', label: 'GPT-6 Luna' }], codexDefault: 'gpt-6.1-sol' };

describe("a reply box's model", () => {
  it('on a Codex thread is its Codex model, by that model\'s name', () => {
    expect(replyModel({ engine: 'codex', model: 'gpt-6-luna' }, {}, codex)).toMatchObject({ engine: 'codex', model: 'gpt-6-luna', label: 'GPT-6 Luna' });
  });
  it('on a Codex thread with no model is the Codex default, not Opus', () => {
    expect(replyModel({ engine: 'codex' }, {}, codex)).toMatchObject({ engine: 'codex', model: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' });
  });
  it('on a thread with no mark but a Codex model is Codex', () => {
    expect(replyModel({ model: 'gpt-6-luna' }, {}, codex).engine).toBe('codex');
  });
  it('follows a pick from the list', () => {
    expect(replyModel({ engine: 'codex', model: 'gpt-6-luna' }, { model: 'gpt-6.1-sol' }, codex).label).toBe('GPT-6.1 Sol');
  });
  it('on a Claude thread stays Claude', () => {
    expect(replyModel({ engine: 'claude', model: 'sonnet' }, {}, codex)).toMatchObject({ engine: 'claude', model: 'sonnet' });
    expect(replyModel({}, {}, codex)).toMatchObject({ engine: 'claude', label: 'Opus 5.5' });
  });
});
