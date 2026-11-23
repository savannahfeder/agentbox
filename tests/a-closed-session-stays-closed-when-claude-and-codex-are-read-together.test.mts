// A CLOSED SESSION STAYS CLOSED WHEN CLAUDE CODE AND CODEX ARE READ TOGETHER.
//
// The schedule forgets the closes and put-offs of a session it is not shown,
// on the reading that the session has exited. Codex sessions joined the same
// list on w-34f79ab66e, and two things would then have reopened her closed
// rows with no other symptom: decorating the two lists one after the other
// (each sweeps the other's keys), and the empty Claude Code list every boot
// starts with now arriving beside a non-empty Codex one.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentSchedule } from '../main/agent-schedule.mts';

const NOW = Date.parse('2026-11-22T18:00:00Z');
let root: string;
const claude = { pid: 41, sessionId: 'claude-1', startedAt: NOW - 3_600_000, status: 'idle' };
const codex = { pid: 0, sessionId: 'codex-1', engine: 'codex' as const, startedAt: NOW - 3_600_000, status: 'idle' };

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('closes survive the combined list', () => {
  it('both closes stay when both lists are decorated as one', () => {
    const s = new AgentSchedule(root);
    s.close('session:claude-1', NOW, NOW);
    s.close('session:codex-1', NOW, NOW);
    const out = s.decorate([claude, codex], NOW);
    expect(out.map((a) => a.doneThrough)).toEqual([NOW, NOW]);
  });
  it('the boot reading, Claude Code empty beside Codex, does not sweep the Claude close when sweeping is held', () => {
    const s = new AgentSchedule(root);
    s.close('session:claude-1', NOW, NOW);
    s.decorate([codex], NOW, { sweep: false });
    expect(new AgentSchedule(root).decorate([claude], NOW)[0].doneThrough).toBe(NOW);
  });
  it('a real reading still forgets a session that has gone', () => {
    const s = new AgentSchedule(root);
    s.close('session:claude-1', NOW, NOW);
    s.decorate([codex], NOW);
    expect(new AgentSchedule(root).decorate([claude], NOW)[0].doneThrough).toBeUndefined();
  });
});

describe('a session put off and then closed', () => {
  // A power tester put a Codex row off, then pressed Done; the toast said done
  // and the row stayed in Later at its moment (w-34f79ab66e, 2026-11-22).
  it('is taken out of the list every tab is drawn from, Later included', async () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    // And while the close waits out its undo: a power tester looked at Later at once and it was still there.
    expect(app).toContain('const agentList = useMemo(() => agentRows.filter((r) => !pendingIds.has(r.id) && (!r.agent || !putAway(r.agent))), [agentRows, pendingIds]);');
    const { putAway } = await import('../shared/agents.mts');
    expect(putAway({ ...codex, runAt: NOW + 3_600_000, doneThrough: NOW, asked: [{ at: NOW - 60_000, text: 'x' }] })).toBe(true);
    expect(putAway({ ...claude, runAt: NOW + 3_600_000, doneThrough: NOW })).toBe(true);
  });
});
