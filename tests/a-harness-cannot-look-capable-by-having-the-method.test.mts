// 2026-10-09, found by Codex while reviewing the ACP design on w-380b06bf53:
// `createHarnessRegistry.supports()` answered by asking whether the adapter has
// a function of that name. That was true enough while every adapter was written
// by hand for one tool. One ACP adapter serving Grok, pi, Gemini and Hermes
// breaks it: the adapter implements every operation for all of them, so it
// looks equally capable of all of them, and what it can actually do is whatever
// THIS tool negotiated at `initialize` — `session/load` is optional in the
// protocol, so resuming a thread is exactly the kind of thing one tool has and
// the next does not.
//
// An engine that claims a capability it has not got is worse than one that
// says it lacks it: the inbox draws the control, the person presses it, and the
// failure arrives later and somewhere else.
import { describe, it, expect, vi } from 'vitest';
import { createHarnessRegistry, harnessFor } from '../main/harnesses.mts';

describe('what a harness can do is what it says, not what it has a method for', () => {
  it('believes an adapter that declares an operation unavailable', () => {
    const compact = vi.fn();
    const registry = createHarnessRegistry([{
      id: 'generic', label: 'Generic', spawn: () => 'started', compact,
      // The one tool behind this adapter cannot resume or compact, whatever
      // the adapter is able to do for another one.
      available: name => !['compact', 'transcript'].includes(name),
    }]);
    expect(registry.supports('generic', 'spawn')).toBe(true);
    expect(registry.supports('generic', 'compact')).toBe(false);
    expect(registry.get('generic').spawn()).toBe('started');
  });

  it('refuses the declined operation before it does anything', () => {
    const compact = vi.fn();
    const registry = createHarnessRegistry([{ id: 'generic', label: 'Generic', compact, available: () => false }]);
    expect(() => registry.get('generic').compact()).toThrow(/Generic.*compact/);
    expect(compact).not.toHaveBeenCalled();
  });

  it('reports a declined optional read as absent rather than as zero', () => {
    const registry = createHarnessRegistry([{ id: 'generic', label: 'Generic', usage: () => ({ used: 0 }), available: () => false }]);
    // Unknown usage is not an empty meter: the inbox must draw nothing, not a
    // full allowance.
    expect(registry.get('generic').usage()).toEqual({ supported: false, engine: 'generic', capability: 'usage' });
    expect(registry.supports('generic', 'usage')).toBe(false);
  });

  it('leaves an adapter that declares nothing exactly as it was', () => {
    // Claude and Codex are hand-written per tool, so having the method is
    // still the whole truth for them, and neither may change behaviour here.
    expect(harnessFor('claude').id).toBe('claude');
    const registry = createHarnessRegistry([{ id: 'plain', label: 'Plain', spawn: () => 'ok' }]);
    expect(registry.supports('plain', 'spawn')).toBe(true);
    expect(registry.supports('plain', 'compact')).toBe(false);
    expect(registry.get('plain').spawn()).toBe('ok');
  });

  it('refuses a declaration that is not a function, like every other field', () => {
    expect(() => createHarnessRegistry([{ id: 'x', label: 'X', available: true }])).toThrow(/available/);
  });
});
