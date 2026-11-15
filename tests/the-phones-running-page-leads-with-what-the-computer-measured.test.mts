// THE PHONE'S RUNNING PAGE LEADS WITH WHAT THE COMPUTER MEASURED.
//
// The desktop's Running page opens on its reading (running now of capacity,
// heavy commands at once, waiting on memory, memory now, and whether new
// agents are held) and its leftovers row ends with what is left running now
// (Settings.tsx `Reading`, `w.leftovers.now`). The phone drew neither: the
// copy carried no memory reading and the leftovers row left out its sentence
// (measured 2026-11-08). The figures are now one rule both pages draw.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { runningFigures } from '../renderer/src/running-reading';
import { phoneSettingsOf } from '../shared/phone-settings.mts';

const reading = (over = {}) => ({ heavy: 2, waiting: 1, pressure: 'tight', usedPct: 81, asked: 12, waited: 3, refused: 0, holding: true, ...over });

describe('the figures', () => {
  it('are running of capacity, heavy, waiting and memory, then what is held and the day\'s tally', () => {
    const f = runningFigures({ running: 3, capacity: 6, gate: { on: true, reading: reading() } });
    expect(f.cells).toEqual([
      { n: '3', of: 'of 6 running' }, { n: '2', of: 'heavy at once' }, { n: '1', of: 'waiting on memory' }, { n: 'Tight', of: 'memory now' },
    ]);
    expect(f.usedPct).toBe(81);
    expect(f.hot).toBe(true);
    expect(f.holding).toBe('New agents wait until memory frees up. Urgent tasks still start.');
    expect(f.tally).toBe('Today: 12 commands asked, 3 waited, none turned away.');
  });

  it('leave out what the computer did not measure', () => {
    const f = runningFigures({ running: 0, capacity: 4, gate: { on: true, reading: reading({ heavy: null, waiting: null, pressure: null, usedPct: null, asked: null, holding: false }) } });
    expect(f.cells).toEqual([{ n: '0', of: 'of 4 running' }]);
    expect(f.usedPct).toBeNull();
    expect(f.holding).toBeNull();
    expect(f.tally).toBeNull();
  });

  it('are not drawn with the memory check off', () => {
    expect(runningFigures({ running: 3, capacity: 6, gate: { on: false, reading: reading() } })).toBeNull();
    expect(runningFigures({ running: 3, capacity: 6, gate: { on: true } })).toBeNull();
  });
});

describe('the copy the computer sends', () => {
  const model = (gate) => ({ ok: true, workspace: { memoryGate: gate, leftovers: { on: true, now: '2 programs left running now.' }, accounts: [], codex: {} }, projects: [] });
  it('carries the memory reading, its numbers only', () => {
    const w = phoneSettingsOf(model({ on: true, slots: null, reading: { ...reading(), secret: '/Users/someone' } }), { version: '1' }).workspace;
    expect(w.memoryGate.reading).toEqual(reading());
    expect(w.leftovers.now).toBe('2 programs left running now.');
  });

  it('carries no reading when the computer has none', () => {
    expect(phoneSettingsOf(model({ on: false }), { version: '1' }).workspace.memoryGate.reading).toBeNull();
  });
});

describe('the pages', () => {
  it('both draw the one rule', () => {
    const phone = fs.readFileSync(new URL('../mobile/src/ui/SettingsPages.tsx', import.meta.url), 'utf8');
    const desktop = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
    expect(phone).toMatch(/runningFigures\(\{ running: w\.running, capacity: w\.agentsTotal/);
    expect(desktop).toMatch(/runningFigures\(\{ running, capacity, gate \}\)/);
  });

  it('end the phone\'s leftovers row with what is left running now', () => {
    const phone = fs.readFileSync(new URL('../mobile/src/ui/SettingsPages.tsx', import.meta.url), 'utf8');
    expect(phone).toMatch(/w\.leftovers\.now \? ` \$\{w\.leftovers\.now\}` : ''/);
  });
});
