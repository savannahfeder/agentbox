// HOW MANY AGENTS ARE WORKING, COUNTED OFF CLAUDE CODE'S OWN OUTPUT.
//
// THE FIXTURE IS REAL AND THAT IS THE WHOLE POINT OF THIS FILE. Every line in
// `fixtures/four-helpers.stream.jsonl` came off Claude Code 2.1.246 running a
// real task that spawned four helpers at once, captured with the same
// `--output-format stream-json --verbose` the supervisor spawns with. Only the
// prompts, summaries and ids were stripped, because they are long and none of
// them is read here. A hand-written stream would have proved that the counter
// agrees with whoever wrote the stream; this proves it agrees with the CLI.
//
// WHAT THE PROBE SETTLED, and it is why the count won and the roster did not:
// four `task_started`, four `task_updated` completions, nothing left open. But
// only SIX `task_progress` lines for the four of them, three of the four
// emitting exactly one for their whole life, and no percentage, step count or
// expected duration anywhere in the output at all. The full reading is in
// decisions.md under 08-26.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countHelpers } from '../main/supervisor.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const lines = fs
  .readFileSync(path.join(here, 'fixtures', 'four-helpers.stream.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));

function replay(upTo = lines.length) {
  const session = {};
  const peak = { value: 0 };
  for (const obj of lines.slice(0, upTo)) {
    countHelpers(session, obj);
    peak.value = Math.max(peak.value, session.helperIds?.size ?? 0);
  }
  return { count: session.helperIds?.size ?? 0, peak: peak.value };
}

describe('counting helpers off the real stream', () => {
  it('reaches four when all four are out', () => {
    expect(replay().peak).toBe(4);
  });

  it('is back to nothing once they have all landed', () => {
    expect(replay().count).toBe(0);
  });

  // The four did not start together and did not finish together: the starts are
  // interleaved with the first helper's progress, and the longest-lived one ran
  // roughly four times as long as the shortest. So the number has to be right at
  // every point in between, not only at the ends.
  it('never overcounts or undercounts at any point in the run', () => {
    let out = 0;
    const session = {};
    for (const obj of lines) {
      if (obj.subtype === 'task_started') out += 1;
      if (obj.subtype === 'task_updated' && obj.patch?.status === 'completed') out -= 1;
      countHelpers(session, obj);
      expect(session.helperIds?.size ?? 0).toBe(out);
    }
  });

  // A pipe read line by line can hand the same line over twice. A counter would
  // then be permanently one too high with nothing able to correct it, and she
  // would read five agents working for the rest of a four-agent run.
  it('survives a line arriving twice', () => {
    const session = {};
    for (const obj of lines) {
      countHelpers(session, obj);
      countHelpers(session, obj);
    }
    expect(session.helperIds.size).toBe(0);
    const half = {};
    for (const obj of lines.filter((l) => l.subtype === 'task_started')) {
      countHelpers(half, obj);
      countHelpers(half, obj);
    }
    expect(half.helperIds.size).toBe(4);
  });

  // A helper that failed or was cancelled has stopped working just as surely as
  // one that completed, and the line must not go on claiming it.
  it('lets a helper go however it ended', () => {
    const session = {};
    countHelpers(session, { type: 'system', subtype: 'task_started', task_id: 'x' });
    expect(session.helperIds.size).toBe(1);
    countHelpers(session, { type: 'system', subtype: 'task_updated', task_id: 'x', patch: { status: 'failed' } });
    expect(session.helperIds.size).toBe(0);
  });

  it('keeps holding one that is still going', () => {
    const session = {};
    countHelpers(session, { type: 'system', subtype: 'task_started', task_id: 'x' });
    countHelpers(session, { type: 'system', subtype: 'task_updated', task_id: 'x', patch: { status: 'in_progress' } });
    expect(session.helperIds.size).toBe(1);
  });

  // Nothing else in the stream may move the number. Assistant turns, tool
  // results and the run's own result are the bulk of what arrives.
  it('ignores everything that is not a task event', () => {
    const session = {};
    countHelpers(session, { type: 'assistant', message: { content: [] } });
    countHelpers(session, { type: 'user', message: { content: [] } });
    countHelpers(session, { type: 'system', subtype: 'init' });
    expect(session.helperIds?.size ?? 0).toBe(0);
  });
});

// THE LEAD IS NOT IN THE NUMBER, AND THE LEAD IS NOT IDLE EITHER.
//
// It was not correct, and the reason it went wrong is worth keeping: the note in
// `shortWord` ASSUMED the lead sits waiting while its sub-agents run, and called
// the count honest on the strength of that assumption. Nobody had measured it.
//
// `fixtures/lead-works-while-a-subagent-is-out.stream.jsonl` is a whole run off
// Claude Code 2.1.246 that settles it: three sub-agents, and the lead's own
// `Bash` tool call sitting in the stream while one of them is still open. The
// distinguishing mark is `parent_tool_use_id`, which is null on the lead's own
// turns and carries the spawning tool call's id on anything belonging to a
// sub-agent. So this is the lead working, at a moment the old word would have
// drawn as "1 Agent Working" while two agents worked.
//
// This is here rather than in a comment so that it cannot quietly stop being
// true. If a future Claude Code really does park the lead, this test fails and
// whoever sees it can weigh counting the lead again.
describe('the orchestrator works alongside its sub-agents', () => {
  const run = fs
    .readFileSync(path.join(here, 'fixtures', 'lead-works-while-a-subagent-is-out.stream.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

  /** The lead's own turns: top-level, belonging to no spawning tool call. */
  const isLeadTurn = (o) => o.type === 'assistant' && !o.parent_tool_use_id;
  const toolNames = (o) => (o.message?.content ?? []).filter((c) => c.type === 'tool_use').map((c) => c.name);

  it('has the lead running its own tool while a sub-agent is still out', () => {
    const session = {};
    let leadTurnsWhileOut = 0;
    const toolsUsedWhileOut = [];
    for (const obj of run) {
      countHelpers(session, obj);
      const out = session.helperIds?.size ?? 0;
      if (out > 0 && isLeadTurn(obj)) {
        leadTurnsWhileOut += 1;
        toolsUsedWhileOut.push(...toolNames(obj));
      }
    }
    expect(leadTurnsWhileOut).toBeGreaterThan(0);
    // Not merely awake: doing work of its own that is not spawning another one.
    expect(toolsUsedWhileOut.filter((n) => n !== 'Agent' && n !== 'Task').length).toBeGreaterThan(0);
  });

  // The count itself is unchanged by any of this, and that is the point: the
  // lead was never in it, so nothing about the number was wrong. The word was.
  it('still counts only the sub-agents', () => {
    const session = {};
    let peak = 0;
    for (const obj of run) {
      countHelpers(session, obj);
      peak = Math.max(peak, session.helperIds?.size ?? 0);
    }
    expect(run.filter((o) => o.subtype === 'task_started').length).toBe(3);
    expect(peak).toBeLessThanOrEqual(3);
    expect(session.helperIds?.size ?? 0).toBe(0);
  });
});
