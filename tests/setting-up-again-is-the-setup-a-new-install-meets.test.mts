// SETTING UP AGAIN IS THE SETUP A NEW INSTALL MEETS (w-fbe5e95dea, 2026-11-10).
//
// "Set Agentbox up again" in ⌘K still ran the old walk, so both round-seven
// testers, having just set up a new install beside the app, met a different
// set of screens. Seven of their issues were that old walk's alone; Back on its
// folder screen skipped the account screen, three and four times. It now opens
// the same setup, and since there is an app behind it, Back on its first
// screen and Escape on its welcome leave it.
//
// On 2026-11-13 the new setup was held back from every real install until it is
// approved, but this command still opened it with setArm('tour'). It now asks
// for the install's word the way a first run does, so a real install gets the
// old first run and a test window still gets the new one.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const app = read('renderer/src/App.tsx');
const body = (name: string) => app.slice(app.indexOf(`const ${name} = useCallback`), app.indexOf('\n  }, [', app.indexOf(`const ${name} = useCallback`)));

describe('Set Agentbox up again', () => {
  it('opens the first run this install gets, not the old walk', () => {
    const fn = body('walkAgain');
    expect(fn).toContain('void armNow().then((a) => { setArm(a); setFresh(true); });');
    expect(fn).not.toMatch(/setArm\('tour'\)/);
    expect(fn).not.toMatch(/setRun\(/);
  });
  it('ends the old first run where a first run ends too', () => {
    expect(body('finishClassic')).toMatch(/setupStartedAgain\.current = false/);
  });
  it('hands that setup a way back to the app', () => {
    expect(app).toMatch(/onLeave=\{setupStartedAgain\.current \? leaveSetupAgain : undefined\}/);
    expect(body('leaveSetupAgain')).toMatch(/setFresh\(false\)/);
  });
  it('is the first run in every other way, ending where a first run ends', () => {
    expect(body('finishFresh')).toMatch(/setupStartedAgain\.current = false/);
  });
});

describe('the setup, when it can be left', () => {
  const flow = read('renderer/src/components/FirstRun.tsx');
  const split = read('renderer/src/components/SetupSplit.tsx');
  it('draws Back on the welcome and takes Escape there', () => {
    expect(flow).toMatch(/screen === 'welcome' && onLeave && <button type="button" className="ob-back"/);
    expect(flow).toMatch(/else if \(onLeave && e\.key === 'Escape'\) \{ e\.preventDefault\(\); onLeave\(\); \}/);
  });
  it('lets Back on the first step go back to the welcome', () => {
    expect(split).toMatch(/const back = !finished && \(at > 0 \|\| p\.onBack\)/);
  });
});
