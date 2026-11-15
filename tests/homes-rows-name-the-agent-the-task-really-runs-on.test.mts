// HOME'S ROWS NAME THE AGENT THE TASK REALLY RUNS ON (QA, 2026-11-15).
//
// On a computer running Codex, every row in Home's In progress read
// "Claude Code · <project>". Home read only the task's own `engine` field,
// which is empty on a task that took the default; the thread page and the
// list read the supervisor's answer (`engines.byItem[id] ?? workspace`) and
// the run's own engine. Home now reads the same.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { engineOnRow, engineName } from '../renderer/src/home/home-model.ts';

const row = { id: 'w-1', product: 'fizz' };

describe('engineOnRow', () => {
  it('is Codex on a Codex computer for a task that named no engine', () => {
    expect(engineName(engineOnRow(row, { engines: { workspace: 'codex', byItem: {} } }))).toBe('Codex');
  });
  it('takes the run that is up over everything else', () => {
    const running = [{ itemId: 'w-1', product: 'fizz', engine: 'codex' }];
    expect(engineOnRow(row, { engines: { workspace: 'claude', byItem: {} }, running })).toBe('codex');
  });
  it('does not take a run on another project with the same id', () => {
    const running = [{ itemId: 'w-1', product: 'other', engine: 'codex' }];
    expect(engineOnRow(row, { engines: { workspace: 'claude', byItem: {} }, running })).toBe('claude');
  });
  it('takes a row that differs from the workspace', () => {
    expect(engineOnRow(row, { engines: { workspace: 'claude', byItem: { 'w-1': 'codex' } } })).toBe('codex');
    expect(engineOnRow(row, { engines: { workspace: 'codex', byItem: { 'w-1': 'claude' } } })).toBe('claude');
  });
  it('reads a Codex import by its label', () => {
    expect(engineOnRow({ ...row, labels: ['codex-import'] }, { engines: { workspace: 'claude', byItem: {} } })).toBe('codex');
  });
  it('is Claude Code on a Claude computer, and falls back to the row with no snapshot', () => {
    expect(engineOnRow(row, { engines: { workspace: 'claude', byItem: {} } })).toBe('claude');
    expect(engineOnRow({ ...row, engine: 'codex' }, {})).toBe('codex');
    expect(engineOnRow(row, {})).toBe('claude');
  });
});

describe("Home's rows", () => {
  it('read the engine through engineOnRow, never the bare field', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).not.toMatch(/engineLetter\(i\.engine\)|engineName\(i\.engine\)/);
    expect(app).toMatch(/const rowEngine = \(i: WorkItem\) => engineOnRow\(i, \{ engines: snap\?\.engines, running: snap\?\.supervisor\?\.running \}\);/);
  });
});
