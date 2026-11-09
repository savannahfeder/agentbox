// ADHD MODE ON THE PHONE SAYS WHAT IT CHANGES (w-e4d49a1539).
//
// 2026-11-02 phone workday, issue 34: Settings, Instructions showed an "ADHD
// mode" switch and nothing else; a tester turned it on, saw "Waiting for your
// computer", could not tell what it would change, and turned it off. The switch
// now says what the rule it turns on asks of agents, and only what it asks.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const says = read('mobile/src/ui/SettingsPages.tsx').match(/export const ADHD_SAYS = '([^']+)'/)?.[1];
const rule = read('briefs/adhd-mode.md');

describe('the ADHD mode switch', () => {
  it('has a line under it', () => {
    expect(says).toBeTruthy();
    expect(read('mobile/src/ui/SettingsPages.tsx')).toMatch(/label="ADHD mode" desc=\{ADHD_SAYS\}/);
  });
  it('claims only what the rule asks: the thing to do first, five steps at most, no recap', () => {
    expect(rule).toMatch(/first line is the thing to do/);
    expect(rule).toMatch(/five or fewer/);
    expect(rule).toMatch(/No recap/);
    expect(says).toMatch(/thing to do/);
    expect(says).toMatch(/five or fewer/);
    expect(says).toMatch(/recap/);
  });
  it('fits on a phone in a line or two, with no colon or dash', () => {
    expect(says.length).toBeLessThanOrEqual(90);
    expect(says).not.toMatch(/[:—–]/);
  });
});
