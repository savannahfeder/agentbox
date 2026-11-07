// THE APP WORKS OUT HOW MANY AGENTS THIS MAC CAN RUN — w-e5225b62ba.
//
// "Realistically, the user shouldn't have to figure out how many agents they
// want at once. That's more of an override that technical people should handle.
// The tool should figure out how many agents can be active at a time."
//
// WHAT THE NUMBER WAS BEFORE, and why it could not be left alone. `machineSlots`
// suggests a number PER ACCOUNT and the page showed it beside a stepper that is
// also per account, while the sentence next to it talked about the total: on
// this Mac the stepper read 3 and the sentence said 6 run together. Two numbers
// for one question, and the one you could change was not the one that mattered.
// So Automatic answers for the MACHINE, and the per-account number is arithmetic
// nobody is shown.
//
// WHY THE MEMORY CHECK RAISES IT. `machineSlots` is one agent per 4 GB, from her
// own two anchors (2 at 8 GB, 4 at 16 GB), and those were set when every agent's
// build and test run competed for memory at the same moment. With the check on
// (w-3958c3753d) heavy commands take turns instead, so what an extra agent costs
// most of the time is its idle footprint — a few hundred MB, measured — and the
// Mac carries half as many again.
//
// MEASURED ON THIS MAC, 16 GB and 10 cores, over about an hour with the check
// on and six agents running: 942 commands asked, 124 waited, NONE refused, with
// three waiting at one point and macOS growing the swap file from 9 GB to 12 GB.
// Nothing was turned away and nothing was stopped, so six is what this Mac
// carries; more agents would have lengthened that queue rather than done more
// work. Six is what this rule answers for this Mac, and it is the number she had
// already settled on by hand.

import { describe, it, expect } from 'vitest';
import { autoAgents, perAccountAgents, MAX_SLOTS, BASELINE_SLOTS } from '../main/machine.mjs';

const GB = 1024 ** 3;
const mac = (gb, cores) => ({ memBytes: gb * GB, cores });

describe('what Automatic answers for a machine', () => {
  it('six on this Mac with the memory check on, which is what she runs by hand', () => {
    expect(autoAgents({ ...mac(16, 10), gated: true })).toBe(6);
  });

  it('leaves the old suggestion exactly where it was when the check is off', () => {
    // Nobody who has not turned the check on gets a bigger number than before.
    expect(autoAgents({ ...mac(16, 10), gated: false })).toBe(4);
    expect(autoAgents({ ...mac(8, 8), gated: false })).toBe(2);
  });

  it('grows with the memory, because memory is what runs out', () => {
    expect(autoAgents({ ...mac(8, 8), gated: true })).toBe(3);
    expect(autoAgents({ ...mac(16, 10), gated: true })).toBe(6);
    expect(autoAgents({ ...mac(24, 12), gated: true })).toBe(9);
  });

  it('is still held down by the cores, so a big-memory small-core Mac is not flooded', () => {
    // 32 GB would say 8 by memory; four cores hold two back for the machine.
    expect(autoAgents({ ...mac(32, 4), gated: true })).toBe(3);
  });

  it('never goes over the range the control itself has', () => {
    expect(autoAgents({ ...mac(128, 24), gated: true })).toBe(MAX_SLOTS);
  });

  it('never answers none, however small the Mac', () => {
    expect(autoAgents({ ...mac(2, 2), gated: true })).toBe(1);
    expect(autoAgents({ ...mac(1, 1), gated: false })).toBe(1);
  });

  it('a machine it could not read gets the baseline, not a tiny number', () => {
    // A syscall that failed must never read as a 0 GB Mac.
    expect(autoAgents({ memBytes: 0, cores: 0, gated: false })).toBe(BASELINE_SLOTS);
    expect(autoAgents({ memBytes: 0, cores: 0, gated: true })).toBe(6);
    expect(autoAgents({ gated: false, memBytes: NaN, cores: NaN })).toBe(BASELINE_SLOTS);
  });
});

describe('after you tell it something felt slow', () => {
  it('runs one fewer, and another press one fewer again', () => {
    expect(autoAgents({ ...mac(16, 10), gated: true, nudge: 1 })).toBe(5);
    expect(autoAgents({ ...mac(16, 10), gated: true, nudge: 2 })).toBe(4);
  });

  it('stops at one rather than at none, however many times you say it', () => {
    expect(autoAgents({ ...mac(16, 10), gated: true, nudge: 99 })).toBe(1);
  });

  it('a nudge that is not a number counts as none', () => {
    expect(autoAgents({ ...mac(16, 10), gated: true, nudge: null })).toBe(6);
    expect(autoAgents({ ...mac(16, 10), gated: true, nudge: -3 })).toBe(6);
    expect(autoAgents({ ...mac(16, 10), gated: true, nudge: 'lots' })).toBe(6);
  });
});

describe('sharing the machine`s number between accounts', () => {
  // The config underneath is still per account, so nothing in the supervisor
  // had to change shape. This is the only place the division happens.
  it('two accounts split this Mac`s six into three each', () => {
    expect(perAccountAgents(6, 2)).toBe(3);
  });

  it('one account gets the lot', () => {
    expect(perAccountAgents(6, 1)).toBe(6);
  });

  it('rounds down, so the machine`s number is a ceiling and never a floor', () => {
    expect(perAccountAgents(6, 4)).toBe(1);
    expect(perAccountAgents(7, 2)).toBe(3);
  });

  it('always leaves each account at least one, so no account is starved', () => {
    expect(perAccountAgents(2, 5)).toBe(1);
    expect(perAccountAgents(1, 3)).toBe(1);
  });

  it('counts no accounts as one, rather than dividing by zero', () => {
    expect(perAccountAgents(6, 0)).toBe(6);
    expect(perAccountAgents(6, null)).toBe(6);
  });
});
