// Home's In progress card said "Claude Code" and drew a C for a thread a Codex
// app-server was running. The thread took the workspace default, so the row
// carried no `engine`, and Home read only that field. On a computer with only
// Codex signed in the workspace default is Codex. Measured on the rule Home
// now draws from: the run that started, a Codex conversation, then main's answer.
import { describe, it, expect } from 'vitest';
import { engineLetter, engineName, rowEngine } from '../renderer/src/home/home-model.ts';

const row = { id: 'w-1', product: 'capitalize-js' };

describe('which agent Home names on a row', () => {
  it('names Codex when the row asked for nothing and the workspace is Codex', () => {
    const e = rowEngine(row, { engines: { workspace: 'codex', byItem: {} } });
    expect(engineName(e)).toBe('Codex');
    expect(engineLetter(e)).toBe('X');
  });

  it('names the agent the running session really started on', () => {
    const running = [{ itemId: 'w-1', product: 'capitalize-js', engine: 'codex' }];
    expect(rowEngine(row, { running, engines: { workspace: 'claude', byItem: {} } })).toBe('codex');
  });

  it('takes main\'s answer for this row over the workspace', () => {
    expect(rowEngine(row, { engines: { workspace: 'claude', byItem: { 'w-1': 'codex' } } })).toBe('codex');
  });

  it('does not take a run on another project\'s row of the same id', () => {
    const running = [{ itemId: 'w-1', product: 'other', engine: 'codex' }];
    expect(rowEngine(row, { running, engines: { workspace: 'claude', byItem: {} } })).toBe('claude');
  });

  it('names Codex for a conversation brought in from Codex', () => {
    expect(rowEngine({ ...row, labels: ['codex-import'] }, { engines: { workspace: 'claude', byItem: {} } })).toBe('codex');
  });

  it('still names Claude Code when that is what the row runs on', () => {
    expect(engineName(rowEngine(row, { engines: { workspace: 'claude', byItem: {} } }))).toBe('Claude Code');
    expect(engineName(rowEngine(row, {}))).toBe('Claude Code');
  });
});
