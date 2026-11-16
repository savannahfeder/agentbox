// A THREAD WHOSE MODEL IS FOR THE OTHER AGENT IS IN NEEDS YOU, NOT QUEUED.
//
// A power tester (2026-11-16) replied on a thread set to Claude Code's opus on a
// copy with only Codex. The thread said "Nothing has been done. Pick a Codex
// model to continue", yet the inbox showed it Queued, "an agent starts as soon
// as one is free", for 26 minutes. `spawnWorker` refuses such a row on every
// tick and leaves it open, and `status()` listed it in `queued`, never in
// `stalled`, so the list rules kept it In progress. Measured here on the
// supervisor's status for both directions, and for the rows that must still
// read Queued.
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { foldWorkItems } from '../shared/work-items.mts';

const OPENED = '2026-09-04T00:00:00Z';
const AFTER = Date.parse('2026-11-16T18:00:00Z');
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function row({ engine, model }: { engine?: string; model?: string } = {}) {
  const item = foldWorkItems([{
    id: 'w-model', ts: AFTER, source: 'founder',
    patch: { title: 'write the article', status: 'open', answer: 'Can I read the article?', ...(engine ? { engine } : {}), ...(model ? { model } : {}) },
  }]).get('w-model');
  return { ...item, product: 'p' };
}

function statusOn({ claude, codex }: { claude: boolean; codex: boolean }, item: ReturnType<typeof row>) {
  const dir = mkdtempSync(join(tmpdir(), 'model-other-agent-'));
  dirs.push(dir);
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-second-account', storeRoot: dir,
      ...(claude ? { claudeBin: '/nonexistent/claude' } : {}),
      ...(codex ? { codexBin: '/nonexistent/codex' } : {}),
      ...(!claude ? { engine: 'codex' } : {}),
      engineChoice: OPENED, maxConcurrentSessions: 4, authProfiles: ['default'],
    },
    { listItems: () => [item], listProducts: () => [{ slug: 'p', dir, repoPath: null }], isDue: () => true, settleAnswer() {}, recordSessionResult() {} },
    '/nonexistent-app',
  );
  if (!claude) sup._enginesFound = () => ({ claude: false, codex: true });
  if (!codex) sup._enginesFound = () => ({ claude: true, codex: false });
  sup.tick = async () => {};
  return sup.status();
}

describe('a thread this computer would run on the other agent', () => {
  it('a Codex model on a computer with only Claude Code is stopped, not queued', () => {
    const s = statusOn({ claude: true, codex: false }, row({ engine: 'codex', model: 'gpt-5.6-sol' }));
    expect(s.stalled).toContain('w-model');
    expect(s.queued).not.toContain('w-model');
  });

  it('a Claude Code model on a computer with only Codex is stopped, not queued', () => {
    const s = statusOn({ claude: false, codex: true }, row({ engine: 'claude', model: 'opus' }));
    expect(s.stalled).toContain('w-model');
    expect(s.queued).not.toContain('w-model');
  });
});

describe('threads that will start stay queued', () => {
  it('a Codex model on a computer with Codex', () => {
    const s = statusOn({ claude: true, codex: true }, row({ engine: 'codex', model: 'gpt-5.6-sol' }));
    expect(s.queued).toContain('w-model');
    expect(s.stalled).not.toContain('w-model');
  });

  it('a thread naming Codex but no model, on a computer with only Claude Code', () => {
    const s = statusOn({ claude: true, codex: false }, row({ engine: 'codex' }));
    expect(s.queued).toContain('w-model');
    expect(s.stalled).not.toContain('w-model');
  });

  it('a Claude Code model on a computer with Claude Code', () => {
    const s = statusOn({ claude: true, codex: false }, row({ engine: 'claude', model: 'opus' }));
    expect(s.queued).toContain('w-model');
    expect(s.stalled).not.toContain('w-model');
  });
});
