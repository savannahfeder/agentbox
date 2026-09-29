// WHAT WE SUGGEST FOR THIS MAC, AND THAT IT NEVER STOPS ANYBODY — w-3d634cbc44.
//
// IT SHIPPED AS A CEILING AND THAT WAS THE WRONG READING. It is a suggestion.
//
// THE LADDER IS LAID OUT BY HAND, with named machines, so a change to the
// arithmetic in main/machine.mjs has to say out loud which of them it moved.
//
// THESE ARE OBSERVED NUMBERS AND NOT A MEASUREMENT, which is the thing to know
// before touching any of them. The first version of this file held what the
// memory arithmetic produced, 8 at once on a 16 GB Mac.
//
// So 2 at 8 GB and 4 at 16 GB are fixed points somebody observed, and the rule
// through them is one agent per 4 GB. Anything that moves those two rows is
// overruling real experience on those Macs and needs a better reason than an
// RSS column, which is what produced the 8.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineSlots, machineNote, MAX_SLOTS, BASELINE_SLOTS } from '../main/machine.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const gb = (n) => n * (1024 ** 3);

/** The named machines, plus the two ends nobody should fall off. */
const MACS = {
  'M1, 8 GB': { memBytes: gb(8), cores: 8 },
  'M4, 16 GB': { memBytes: gb(16), cores: 10 },
  'M4 Pro, 24 GB': { memBytes: gb(24), cores: 12 },
  'M4 Pro, 36 GB': { memBytes: gb(36), cores: 14 },
  'M4 Max, 64 GB': { memBytes: gb(64), cores: 16 },
  'a 4 GB machine': { memBytes: gb(4), cores: 4 },
};

describe('how many agents this Mac is offered', () => {
  it('walks her own ladder, smallest to largest', () => {
    const walked = Object.fromEntries(
      Object.entries(MACS).map(([name, spec]) => [name, machineSlots(spec).slots]),
    );
    expect(walked).toEqual({
      // The two fixed points.
      'M1, 8 GB': 2,
      'M4, 16 GB': 4,
      // 24 GB scales along the same line.
      'M4 Pro, 24 GB': 6,
      'M4 Pro, 36 GB': 9,
      // 64 divided by 4 is 16, and the stepper ends at 12.
      'M4 Max, 64 GB': 12,
      'a 4 GB machine': 1,
    });
  });

  it('is one agent per 4 GB, so a machine nobody listed still gets an answer', () => {
    // The claim is that the ladder is a RULE and not a lookup table, so it
    // scales to any amount of memory.
    for (const memGb of [8, 12, 16, 20, 24, 28, 32, 36, 40]) {
      expect(machineSlots({ memBytes: gb(memGb), cores: 24 }).slots).toBe(memGb / 4);
    }
  });

  it('never offers nobody an agent at all', () => {
    // A machine too small for the arithmetic still has to run the app. An app
    // that will start no agent is broken rather than careful.
    expect(machineSlots({ memBytes: gb(2), cores: 2 }).slots).toBe(1);
  });

  it('answers the baseline when it cannot read the machine at all', () => {
    for (const spec of [{ memBytes: 0, cores: 0 }, { memBytes: NaN, cores: 8 }]) {
      const read = machineSlots(spec);
      expect(read.slots).toBe(BASELINE_SLOTS);
      expect(read.slots).toBe(4);
      expect(read.known).toBe(false);
    }
    // And it says nothing on the row rather than claiming the Mac has 0 GB.
    expect(machineNote(machineSlots({ memBytes: 0, cores: 0 }))).toBe(null);
  });

  it('is memory that decides on every Mac Apple sells', () => {
    // At one agent per 4 GB, `cores - 2` is slack on real hardware: it is here
    // for a box with a lot of RAM and few cores, which does exist as a VM or a
    // rented host and which the memory rule alone would promise twelve.
    for (const name of ['M1, 8 GB', 'M4, 16 GB', 'M4 Pro, 24 GB', 'M4 Pro, 36 GB']) {
      const read = machineSlots(MACS[name]);
      expect(read.byMemory).toBeLessThanOrEqual(read.byCores);
      expect(read.slots).toBe(read.byMemory);
    }
    // A 64 GB box with four cores is the case the core rule is for.
    expect(machineSlots({ memBytes: gb(64), cores: 4 }).slots).toBe(2);
    // And the stepper's range is what stops the biggest Mac, not the hardware.
    expect(machineSlots(MACS['M4 Max, 64 GB']).slots).toBe(MAX_SLOTS);
  });

  it('suggests in her words, and never says it is a wall', () => {
    expect(machineNote(machineSlots(MACS['M1, 8 GB'])))
      .toBe('This Mac has 8 GB and 8 cores, so we suggest 2 at once. Go higher if you want to.');
    // THE WORDING IS THE CLAIM HERE, not decoration. This line first read "so 2
    // at once is as high as it goes here", which was true while the number was
    // a ceiling and is a lie now that it is advice.
    const said = machineNote(machineSlots(MACS['M4, 16 GB']));
    expect(said).toContain('we suggest');
    expect(said).not.toMatch(/as high as it goes|maximum|limit/i);
  });

  it('goes quiet once somebody is already at or under what it suggests', () => {
    // A sentence recommending a number she has already taken is a line to read
    // past, on a page that is trying not to have any.
    const mac = machineSlots(MACS['M4, 16 GB']);
    expect(machineNote(mac, 4)).toBe(null);
    expect(machineNote(mac, 2)).toBe(null);
    expect(machineNote(mac, 7)).toContain('we suggest 4');
  });

  it('has no em dash in the sentence she reads', () => {
    expect(machineNote(machineSlots(MACS['M1, 8 GB']))).not.toMatch(/—/);
  });
});

describe('the suggestion stops nobody', () => {
  const settings = fs.readFileSync(path.join(root, 'main/settings.mjs'), 'utf8');
  const pane = fs.readFileSync(path.join(root, 'renderer/src/components/Settings.tsx'), 'utf8');

  // THE CORRECTION, HELD IN THREE PLACES.
  it('leaves the stepper the same range on every Mac', () => {
    expect(pane).toContain('max={w.slotsMax ?? 12}');
    expect(pane).not.toContain('slotsSuggested ?? 12');
  });

  it('does not clamp the write to the machine', () => {
    expect(settings).not.toMatch(/Math\.min\(machineSlots\(\)\.slots,/);
    expect(settings).toMatch(/Math\.min\(MAX_SLOTS,/);
  });

  it('chooses the number nobody set, and leaves a number she set alone', () => {
    const config = fs.readFileSync(path.join(root, 'main/config.mjs'), 'utf8');
    // Inside the same `nobody said` branch the plan cap is in, so the two
    // compose instead of one undoing the other.
    // THE MACHINE IS THE PLAN'S FALLBACK, not a second `Math.min` after it.
    // Taking the smaller of a flat default and the machine, which is what
    // shipped first, holds every Mac at that default or below, so it can never
    // scale up. `slotsForPlans` already answers 1 for a small subscription and
    // its fallback otherwise, so handing it the machine number is the whole
    // composition.
    expect(config).toMatch(/slotsForPlans\(plans, config\.machineSlots\)/);
    expect(config).not.toMatch(/Math\.min\(config\.maxConcurrentSessions, config\.machineSlots\)/);
    // And still only for somebody who has set no number of their own.
    expect(config).toMatch(
      /if \(typeof overrides\.maxConcurrentSessions !== 'number'\) \{\s*const plans = readPlans/,
    );
  });
});
