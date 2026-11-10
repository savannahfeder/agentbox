// AUTOMATIC DECIDES THE AGENT COUNT, AND A NUMBER YOU SET OVERRIDES IT — w-e5225b62ba.
//
// "The tool should figure out how many agents can be active at a time... that's
// more of an override that technical people should handle."
//
// WHAT THIS HAD TO NOT BREAK, which is most of the care in this file. The cap
// underneath is still per account and `_capacityFor` still multiplies it by the
// live accounts, so nothing downstream of it moved. Automatic only changes where
// that per-account number comes from: the machine, divided by the accounts,
// instead of a number sitting in zero.config.json.
//
// AND AN EXISTING INSTALL IS NOT QUIETLY CHANGED. Anybody who ever set the
// number by hand keeps exactly the number they set; Automatic is for the people
// who never touched it, which is what the old "fill it in once at load" was
// already doing less visibly.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mts';
import { autoAgents } from '../main/machine.mts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const made = [];
afterEach(() => { for (const s of made.splice(0)) s.stopMemoryGate?.(); });

// THE MACHINE IS PINNED, NOT READ (2026-10-05, w-9f6975906c). These read the
// computer the suite ran on, so they passed on a 16 GB, 10 core Mac (4 agents,
// 6 with the memory check) and went red on GitHub's runner, which came out at 1
// in every case: "expected 1 to be greater than 1", "expected 1 to be 2",
// "expected 1 to be +0" (run 37404391585). One agent cannot carry more, split
// or come down a step, so the three claims were untestable there. Every
// supervisor here is told it is that same 16 GB, 10 core Mac.
const MAC = { memBytes: 16 * 1024 ** 3, cores: 10 };

/** A supervisor with `accounts` Claude logins and the config under test. */
function sup(config = {}, accounts = 1, machine = MAC) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-agents-'));
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true, readItem: () => null };
  const s = new Supervisor({ storeRoot: tmp, home: tmp, ...config }, store, root, tmp, tmp);
  s._liveProfilesFor = () => Array.from({ length: accounts }, (_, i) => (i ? `p${i}` : 'default'));
  s.engineChoices = () => [{ id: 'claude' }];
  s._machine = () => machine;
  made.push(s);
  return s;
}

const here = (gated, nudge = 0) => autoAgents({ ...MAC, gated, nudge });

describe('the machine Automatic asks about', () => {
  it('is the one the supervisor is told about, so the answer does not depend on where it runs', () => {
    const tiny = sup({ agentsAuto: true, memoryGate: true }, 1, { memBytes: 7 * 1024 ** 3, cores: 2 });
    const mac = sup({ agentsAuto: true, memoryGate: true }, 1, MAC);
    expect(tiny._slotsPerAccount('claude')).toBe(1);
    expect(mac._slotsPerAccount('claude')).toBe(6);
  });
});

describe('with Automatic on', () => {
  it('asks the machine, not the config', () => {
    const s = sup({ agentsAuto: true, memoryGate: false, maxConcurrentSessions: 99 });
    expect(s._slotsPerAccount('claude')).toBe(here(false));
  });

  it('carries more once the memory check is on, because heavy work takes turns', () => {
    const off = sup({ agentsAuto: true, memoryGate: false });
    const on = sup({ agentsAuto: true, memoryGate: true });
    expect(on._slotsPerAccount('claude')).toBeGreaterThan(off._slotsPerAccount('claude'));
  });

  it('splits the machine`s number across the accounts rather than per account', () => {
    // THE BUG THIS EXISTS FOR: the number used to be per account, so connecting a
    // second account silently doubled what the Mac was asked to carry.
    const one = sup({ agentsAuto: true, memoryGate: true }, 1);
    const two = sup({ agentsAuto: true, memoryGate: true }, 2);
    expect(one._capacityFor('claude')).toBe(two._capacityFor('claude'));
  });

  it('comes down a step each time you say something felt slow', () => {
    const calm = sup({ agentsAuto: true, memoryGate: true }, 1);
    const once = sup({ agentsAuto: true, memoryGate: true, agentsNudge: 1 }, 1);
    expect(once._slotsPerAccount('claude')).toBe(calm._slotsPerAccount('claude') - 1);
  });

  it('never comes out at none, however many times you said it', () => {
    const s = sup({ agentsAuto: true, memoryGate: true, agentsNudge: 99 }, 1);
    expect(s._slotsPerAccount('claude')).toBe(1);
  });

  it('ignores a leftover per-login number: the Mac is in charge', () => {
    for (const left of [1, 99]) {
      const s = sup({ agentsAuto: true, memoryGate: true, maxConcurrentSessions: left }, 1);
      expect(s._slotsPerAccount('claude')).toBe(here(true));
    }
  });
});

describe('with a number you set', () => {
  it('uses it exactly, and the machine is not consulted', () => {
    const s = sup({ agentsAuto: false, memoryGate: true, maxConcurrentSessions: 9 }, 1);
    expect(s._slotsPerAccount('claude')).toBe(9);
  });

  it('stays per account, which is what it always was', () => {
    const two = sup({ agentsAuto: false, memoryGate: true, maxConcurrentSessions: 4 }, 2);
    expect(two._capacityFor('claude')).toBe(8);
  });

  it('never drops the fleet to nothing when the number is nonsense', () => {
    for (const bad of [0, -2, null, 'three', undefined]) {
      expect(sup({ agentsAuto: false, maxConcurrentSessions: bad }, 1)._slotsPerAccount('claude')).toBe(1);
    }
  });
});
