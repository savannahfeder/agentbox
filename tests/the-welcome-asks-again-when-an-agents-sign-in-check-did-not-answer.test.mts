// THE WELCOME ASKS AGAIN WHEN AN AGENT'S SIGN-IN CHECK DID NOT ANSWER (w-1e52420829, 2026-11-13).
//
// Someone who uses Claude Code every day opened a new copy and read "CODEX
// READY"; their first thread then ran on Codex. Claude Code was installed and
// signed in. Its own sign-in check has 15 seconds to answer, the Mac was busy
// with other agents (load 67 when this was reproduced; the same check answers
// in 0.1 s on a quiet Mac), and a check that did not answer was counted as
// signed out. The first-run walk stopped on the same words on its first screen.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { knownSignedOut, offeredEngines, readyEngines, unsureEngines } from '../renderer/src/first-run.ts';

const flow = fs.readFileSync(new URL('../renderer/src/components/FirstRun.tsx', import.meta.url), 'utf8');

describe('an agent whose check did not answer', () => {
  it('is one that was found and established nothing', () => {
    expect(unsureEngines([{ engine: 'claude', found: true, signedIn: false, certain: false }, { engine: 'codex', found: true, signedIn: true, certain: true }])).toEqual(['claude']);
  });
  it('is not one that answered no', () => {
    expect(unsureEngines([{ engine: 'claude', found: true, signedIn: false, certain: true }])).toEqual([]);
    expect(unsureEngines([{ engine: 'claude', found: true, signedIn: false }])).toEqual([]);
  });
  it('is not one that is not on this computer, or a call that failed outright', () => {
    expect(unsureEngines([{ engine: 'codex', found: false, signedIn: false, certain: false }, null])).toEqual([]);
  });
  it('is not called ready by a single reading', () => {
    expect(readyEngines([{ engine: 'claude', found: true, signedIn: false, certain: false }])).toEqual([]);
  });
});

// At load 120 all four asks went unanswered and the walk read "CODEX READY" again.
describe('an agent still unsure after every ask', () => {
  const busy = [{ engine: 'claude' as const, found: true, signedIn: false, certain: false }, { engine: 'codex' as const, found: true, signedIn: true, certain: true }];
  it('is offered with the ready ones, Claude Code first, since it is installed and nothing said it is signed out', () => {
    expect(offeredEngines(busy)).toEqual(['claude', 'codex']);
  });
  it('is not listed as signed out', () => {
    expect(knownSignedOut(busy)).toEqual([]);
  });
  it('leaves a real no as a no', () => {
    const no = [{ engine: 'claude' as const, found: true, signedIn: false, certain: true }, { engine: 'codex' as const, found: true, signedIn: true, certain: true }];
    expect(offeredEngines(no)).toEqual(['codex']);
    expect(knownSignedOut(no)).toEqual(['claude']);
  });
  it('is what the welcome shows', () => {
    expect(flow).toMatch(/setReady\(offeredEngines\(readings\)\);\n      setSignedOut\(knownSignedOut\(readings\)\);/);
  });
});

describe('the welcome', () => {
  it('asks an unsure agent again before it says which are ready, three times at most', () => {
    expect(flow).toMatch(/for \(let again = 0; again < ASKS_AGAIN && unsureEngines\(readings\)\.length; again \+= 1\)/);
    expect(flow).toMatch(/const ASKS_AGAIN = 3;/);
    expect(flow).toMatch(/unsureEngines\(readings\)\.includes\(r\?\.engine as Engine\) \? api\.engineSetup\('ready', r!\.engine\)\.catch\(\(\) => r\) : r/);
  });
});
