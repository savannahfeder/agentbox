// THE REPLY BOX KNEW TWO HARNESSES.
//
// Photographed on 2026-11-22 in the stand-in world with OpenCode on offer: the
// folded reply box of a thread on OpenCode read `opencode/big-pickle`, where
// the new thread card reads "Big Pickle". And read off the code: the open box
// took any harness that was not Codex for Claude Code, so it showed that thread
// as Claude Code's and a reply would have offered to "move" it there; a reply
// that named no model would have sent `opus` to OpenCode; and Codex's commands
// and permission words were offered on a harness that takes neither.
import { describe, it, expect, afterEach } from 'vitest';
import { engineModelLabel, setFurtherHarnesses, furtherHarnesses } from '../renderer/src/models';
import { pickToSend, replyHarness, takesModesAndCommands } from '../renderer/src/reply-pick';
import { fixtureOpenCodeModels } from '../renderer/src/fixtures';

const OPENCODE = { id: 'opencode', label: 'OpenCode', word: 'OpenCode', models: fixtureOpenCodeModels };
const codexModels = [{ id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' }];

afterEach(() => setFurtherHarnesses(null));

describe('the name of a model, wherever the app says it', () => {
  it('is the harness\'s own word for a model of a further harness', () => {
    setFurtherHarnesses([OPENCODE]);
    expect(engineModelLabel('opencode', 'opencode/big-pickle')).toBe('Big Pickle');
  });

  it('is the id for a model the harness no longer lists, and the harness\'s name when the thread names no model', () => {
    setFurtherHarnesses([OPENCODE]);
    expect(engineModelLabel('opencode', 'opencode/gone')).toBe('opencode/gone');
    expect(engineModelLabel('opencode', null)).toBe('OpenCode');
  });

  it('names Claude Code\'s and Codex\'s models as it always did, with a further harness on offer or not', () => {
    const before = [engineModelLabel('claude', 'opus'), engineModelLabel(null, null), engineModelLabel('codex', 'gpt-5.6-sol', { codexModels }), engineModelLabel('codex', null, { codexModels, codexDefault: 'gpt-5.6-sol' })];
    setFurtherHarnesses([OPENCODE]);
    const after = [engineModelLabel('claude', 'opus'), engineModelLabel(null, null), engineModelLabel('codex', 'gpt-5.6-sol', { codexModels }), engineModelLabel('codex', null, { codexModels, codexDefault: 'gpt-5.6-sol' })];
    expect(after).toEqual(before);
    expect(before[2]).toBe('GPT-5.6-Sol');
  });

  it('holds nothing when the app says there is no further harness', () => {
    setFurtherHarnesses([OPENCODE]);
    setFurtherHarnesses(undefined);
    expect(furtherHarnesses()).toEqual([]);
    setFurtherHarnesses('nonsense' as never);
    expect(furtherHarnesses()).toEqual([]);
  });
});

describe('which harness the reply box shows', () => {
  it('is the further harness the thread runs on, not Claude Code', () => {
    expect(replyHarness('opencode', null, ['opencode'])).toEqual({ now: 'opencode', shown: 'opencode' });
  });

  it('follows a pick to another harness, and back', () => {
    expect(replyHarness('opencode', 'claude', ['opencode'])).toEqual({ now: 'opencode', shown: 'claude' });
    expect(replyHarness('claude', 'opencode', ['opencode'])).toEqual({ now: 'claude', shown: 'opencode' });
    expect(replyHarness('codex', 'opencode', ['opencode'])).toEqual({ now: 'codex', shown: 'opencode' });
  });

  it('reads a harness that is not on offer here as Claude Code, as it always has', () => {
    expect(replyHarness('opencode', null, [])).toEqual({ now: 'claude', shown: 'claude' });
    expect(replyHarness('claude', 'opencode', [])).toEqual({ now: 'claude', shown: 'claude' });
  });

  it('is unchanged between Claude Code and Codex', () => {
    expect(replyHarness('codex', null)).toEqual({ now: 'codex', shown: 'codex' });
    expect(replyHarness('claude', null)).toEqual({ now: 'claude', shown: 'claude' });
    expect(replyHarness(null, null)).toEqual({ now: 'claude', shown: 'claude' });
    expect(replyHarness(undefined, 'codex')).toEqual({ now: 'claude', shown: 'codex' });
    expect(replyHarness('codex', 'claude')).toEqual({ now: 'codex', shown: 'claude' });
    expect(replyHarness('codex', 'nonsense')).toEqual({ now: 'codex', shown: 'codex' });
  });
});

describe('what a reply writes onto the thread', () => {
  it('keeps the model of a further harness as picked, and writes no harness when the thread stays where it is', () => {
    expect(pickToSend({ model: 'opencode/big-pickle', effort: null }, { engine: 'opencode', was: 'opencode', engineCount: 3 }))
      .toEqual({ model: 'opencode/big-pickle', effort: null });
  });

  it('never sends Claude Code\'s default model to a further harness', () => {
    expect(pickToSend({ model: null, effort: null }, { engine: 'opencode', was: 'opencode', engineCount: 3 }).model).toBeNull();
  });

  it('names the harness when the pick moves the thread onto it or off it', () => {
    expect(pickToSend({ model: 'opencode/big-pickle', effort: null }, { engine: 'opencode', was: 'claude', engineCount: 2 }).engine).toBe('opencode');
    expect(pickToSend({ model: 'sonnet', effort: null }, { engine: 'claude', was: 'opencode', engineCount: 2 })).toEqual({ model: 'sonnet', effort: null, engine: 'claude' });
  });

  it('writes Claude Code\'s and Codex\'s picks as it always did', () => {
    expect(pickToSend({ model: null, effort: 'high' }, { engine: 'claude', was: 'claude', engineCount: 2 })).toEqual({ model: 'opus', effort: 'high' });
    expect(pickToSend({ model: null, effort: null })).toEqual({ model: 'opus', effort: null });
    expect(pickToSend({ model: null, effort: null }, { engine: 'codex', was: 'codex', engineCount: 2 })).toEqual({ model: null, effort: null });
    expect(pickToSend({ model: 'gpt-5.6-sol', effort: null }, { engine: 'codex', was: 'claude', engineCount: 2 })).toEqual({ model: 'gpt-5.6-sol', effort: null, engine: 'codex' });
  });
});

describe('the permission words and commands in the reply box', () => {
  it('are not offered on a thread that runs on a further harness', () => {
    expect(takesModesAndCommands('opencode', ['opencode'])).toBe(false);
  });

  it('are offered on Claude Code and Codex threads as before, further harness on offer or not', () => {
    for (const further of [[], ['opencode']]) {
      expect(takesModesAndCommands('claude', further)).toBe(true);
      expect(takesModesAndCommands('codex', further)).toBe(true);
      expect(takesModesAndCommands(null, further)).toBe(true);
      expect(takesModesAndCommands(undefined, further)).toBe(true);
    }
    // A harness not on offer here is read as Claude Code, so it keeps Claude Code's controls.
    expect(takesModesAndCommands('opencode', [])).toBe(true);
  });
});
