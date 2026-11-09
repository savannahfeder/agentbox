// THE RUNNING PAGE LEADS WITH WHAT IT MEASURED — w-e5225b62ba.
//
// The page said what it knew at the end of three grey paragraphs — "6 running
// now", "Holding 3 commands now; memory is tight", "Nothing running now" — so
// the one part of the screen that was actually measured was the part nobody
// read. These figures are that, lifted out, and the approved drawing leads with
// them.
//
// EVERY FIELD IS NULL WHEN IT IS NOT KNOWN, and the page leaves out what is
// null. A reading card exists to be the trustworthy corner of the screen, so a
// figure invented to fill a slot would cost it the only thing it has.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { memoryReading, setWorkspaceSetting } from '../main/settings.mts';
import { agentCountOptions } from '../renderer/src/components/Settings.tsx';

const dirs = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const gate = (over = {}) => ({
  role: 'owner',
  pressure: 'tight',
  freePct: 16,
  running: [{ holdsSlot: true }, { holdsSlot: true }, { holdsSlot: false }],
  waiting: [{}, {}, {}],
  counts: { asked: 942, waited: 124, refused: 0, foreign: 7 },
  ...over,
});
const read = (config, status) => memoryReading({ config, supervisor: { memoryGateStatus: () => status } });

describe('the figures the card leads with', () => {
  it('counts only the commands actually holding a slot as heavy', () => {
    expect(read({ memoryGate: true }, gate()).heavy).toBe(2);
  });

  it('carries the queue, the pressure and how much memory is gone', () => {
    const r = read({ memoryGate: true }, gate());
    expect(r.waiting).toBe(3);
    expect(r.pressure).toBe('tight');
    expect(r.usedPct).toBe(84);
  });

  it('carries the day`s tally, including that nothing was turned away', () => {
    const r = read({ memoryGate: true }, gate());
    expect([r.asked, r.waited, r.refused]).toEqual([942, 124, 0]);
  });

  it('knows nothing at all while the check is off', () => {
    expect(read({ memoryGate: false }, gate())).toEqual({
      heavy: null, waiting: null, pressure: null, usedPct: null, asked: null, waited: null, refused: null,
    });
  });

  it('knows nothing when another Agentbox is the one coordinating', () => {
    // A standby's own counts are zero and would read as a quiet Mac.
    expect(read({ memoryGate: true }, gate({ role: 'standby' })).asked).toBe(null);
  });

  it('leaves out a reading the kernel did not give, rather than guessing one', () => {
    expect(read({ memoryGate: true }, gate({ freePct: null })).usedPct).toBe(null);
    expect(read({ memoryGate: true }, gate({ counts: {} })).asked).toBe(null);
  });

  it('stays inside nought and a hundred whatever the kernel says', () => {
    expect(read({ memoryGate: true }, gate({ freePct: -20 })).usedPct).toBe(100);
    expect(read({ memoryGate: true }, gate({ freePct: 140 })).usedPct).toBe(0);
  });

  it('survives a gate that is not there or throws', () => {
    expect(read({ memoryGate: true }, null).heavy).toBe(null);
    const r = memoryReading({ config: { memoryGate: true }, supervisor: { memoryGateStatus: () => { throw new Error('gone'); } } });
    expect(r.heavy).toBe(null);
  });
});

// THE CONTROL IS ONE DROPDOWN (2026-10-05): "for 'How many run at once', I
// think it would be better as a dropdown." Automatic and every number it could
// have been are the same question, so they are the same menu rather than a
// choice of two and then a stepper.
describe('the menu behind how many run at once', () => {
  const opts = (w) => agentCountOptions({ slotsMax: 12, ...w });

  it('offers Automatic first, carrying the number it settled on', () => {
    expect(opts({ agentsTotal: 6 })[0]).toEqual({ value: 'auto', label: 'Automatic (6 agents)' });
  });

  it('says one agent rather than 1 agents', () => {
    expect(opts({ agentsTotal: 1 })[0].label).toBe('Automatic (1 agent)');
    expect(opts({ agentsTotal: 6, accounts: [{}] })[1].label).toBe('1 agent');
  });

  it('counts every number for the machine, not for one account', () => {
    // THE BUG THIS EXISTS FOR: a per-account menu on a two-account Mac offers
    // 3 and silently means 6. Since w-ec27ff1a51 the number stored is the
    // machine's too, so each option stores exactly what it says.
    const two = opts({ agentsTotal: 6, accounts: [{}, {}] });
    expect(two[1].label).toBe('1 agent');
    expect(two[6].label).toBe('6 agents');
    expect(two[6].value).toBe('6');
  });

  it('stores the number it says, on one login as on two', () => {
    const one = opts({ agentsTotal: 6, accounts: [{}] });
    expect(one[6]).toEqual({ value: '6', label: '6 agents' });
  });

  it('is the same length on every Mac, because the hardware only suggests', () => {
    expect(opts({ agentsTotal: 6, slotsMax: 12 })).toHaveLength(13);
    expect(opts({ agentsTotal: 2, slotsMax: 12 })).toHaveLength(13);
  });

  it('survives a payload with no accounts and no capacity yet', () => {
    expect(() => opts({})).not.toThrow();
    expect(opts({})[0].label).toBe('Automatic (1 agent)');
  });

  /* NO DASH IN ANYTHING SHE READS (2026-10-05). The Automatic option joined its
     two halves with an em dash and she caught it on the screen: "looks quite
     bad". The app has refused them in `machineNote` since that sentence was
     written, and a menu label is read exactly as a sentence is, so the rule
     covers both. The en dash is here too because it is the one that gets typed
     by accident. */
  it('has no em dash or en dash in any option', () => {
    for (const o of opts({ agentsTotal: 6, accounts: [{}, {}] })) {
      expect(o.label).not.toMatch(/[—–]/);
    }
  });
});

describe('the words on the Running page', () => {
  const pane = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
  const running = pane.slice(pane.indexOf("pane === 'running'"), pane.indexOf("pane === 'appearance'"));

  // The same rule over the page's own labels and sentences, which is where one
  // would land next. Comments are left alone: this file's own prose uses them.
  it('carries no em dash or en dash in a label or a sentence', () => {
    const read = running.split('\n').filter((l) => /label=|desc=/.test(l));
    expect(read.length).toBeGreaterThan(4);
    for (const line of read) expect(line).not.toMatch(/[—–]/);
  });
});

describe('who decides the number', () => {
  // A real folder, because these writes go through saveConfig and the point of
  // the test is that what is written is what comes back.
  const bed = (config = {}) => {
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'running-page-'));
    dirs.push(appDir);
    return { config: { appDir, home: appDir, ...config }, supervisor: { wake: () => {}, onChange: () => {} } };
  };

  it('setting a number by hand takes the decision back, so no stepper is ignored', () => {
    const { config, supervisor } = bed({ agentsAuto: true, maxConcurrentSessions: 3 });
    setWorkspaceSetting({ config, supervisor }, { key: 'sessionsAtOnce', value: 9 });
    expect(config.agentsAuto).toBe(false);
    expect(config.agentsAtOnce).toBe(9);
  });

  it('turning Automatic on keeps the number you had, so turning it off gives it back', () => {
    const { config, supervisor } = bed({ agentsAuto: false, maxConcurrentSessions: 9 });
    setWorkspaceSetting({ config, supervisor }, { key: 'agentsAuto', value: true });
    expect(config.agentsAuto).toBe(true);
    expect(config.maxConcurrentSessions).toBe(9);
    setWorkspaceSetting({ config, supervisor }, { key: 'agentsAuto', value: false });
    expect(config.maxConcurrentSessions).toBe(9);
  });

  it('something felt slow takes it down one step at a time', () => {
    const { config, supervisor } = bed({ agentsAuto: true, agentsNudge: 0 });
    setWorkspaceSetting({ config, supervisor }, { key: 'agentsFeltSlow', value: true });
    expect(config.agentsNudge).toBe(1);
    setWorkspaceSetting({ config, supervisor }, { key: 'agentsFeltSlow', value: true });
    expect(config.agentsNudge).toBe(2);
  });

  it('and there is a way back to where it started', () => {
    const { config, supervisor } = bed({ agentsAuto: true, agentsNudge: 4 });
    setWorkspaceSetting({ config, supervisor }, { key: 'agentsFeltSlow', value: 'reset' });
    expect(config.agentsNudge).toBe(0);
  });

  it('counts a nudge that is not a number as none, rather than NaN forever', () => {
    const { config, supervisor } = bed({ agentsAuto: true, agentsNudge: 'lots' });
    setWorkspaceSetting({ config, supervisor }, { key: 'agentsFeltSlow', value: true });
    expect(config.agentsNudge).toBe(1);
  });
});
