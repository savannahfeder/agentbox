// A POWER TEST CAN GET ITS AGENTS STUCK ON ONE CAUSE (w-bb45118b10).
//
// One row per cause (shared/causes.mts) only shows when several threads hit
// the same outside cause, and stand-in agents never did: nothing in their
// world was outside their own work. --stuck adds a stretch, a twentieth to six
// tenths of the way in (widened after the second Codex run, where testers
// away on calls met none of it), where 7 in 10 stand-in starts call wait_on_cause on
// "Your Mac can't push to GitHub", as ten threads did on 2026-11-08. Without
// the flag the day is unchanged, and a real-tools day never has it.
import { describe, it, expect } from 'vitest';
import { chaosPlan, worldAt, STUCK_CAUSE } from '../.claude/skills/power-test/scripts/plan.mjs';
import { worldTurn } from '../scripts/lib/stand-in-world.mjs';

const HOUR = 3_600_000;

describe('the stretch where agents get stuck', () => {
  it('is on the day only with --stuck', () => {
    expect(chaosPlan('normal', HOUR).map((e) => e.kind)).not.toContain('stuck');
    expect(chaosPlan('normal', HOUR, { stuck: true }).map((e) => e.kind)).toContain('stuck');
  });

  it('never on real tools, whose agents decide for themselves', () => {
    expect(chaosPlan('normal', HOUR, { stuck: true, real: true }).map((e) => e.kind)).not.toContain('stuck');
  });

  it('runs from a twentieth to six tenths of the way in, and not after', () => {
    const plan = chaosPlan('normal', HOUR, { stuck: true });
    expect(worldAt(plan, 0.04 * HOUR).stuck).toBeUndefined();
    expect(worldAt(plan, 0.3 * HOUR).stuck).toMatchObject({ cause: STUCK_CAUSE, share: 0.7 });
    expect(worldAt(plan, 0.61 * HOUR).stuck).toBeUndefined();
  });
});

describe('one start in that stretch', () => {
  const world = { stuck: { cause: STUCK_CAUSE, ask: 'Run gh auth login', share: 0.7 } };

  it('is stuck on the cause when its draw falls inside the share', () => {
    expect(worldTurn(world, 'default', () => 0.5).stuck).toEqual({ cause: STUCK_CAUSE, ask: 'Run gh auth login' });
  });

  it('is not when it falls outside, or when the world has no cause', () => {
    expect(worldTurn(world, 'default', () => 0.9).stuck).toBeNull();
    expect(worldTurn({}, 'default', () => 0).stuck).toBeNull();
  });
});
