// ADDING A CLOUD ACCOUNT ENDS WITHOUT THE FIRST-TIME QUESTION.
//
// What happened (2026-10-16, 8:26pm): with the cloud already set up, she
// added a second account, pressed Done, and was shown "You're set up / Where
// should new threads start?", the question that belongs to the first setup.
// Her words: "it shouldn't bring me to the screen after I hit Done if I
// already have it set up."
//
// Now Done asks where threads start only when no cloud account could run as
// the screen opened; otherwise it closes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { doneAsksWhere } from '../renderer/src/cloud-setup';

const account = (state) => ({ engine: 'claude', key: state, name: null, ready: state === 'ready', state });

describe('Done on the cloud\'s setup screen', () => {
  it('asks where threads start the first time, when no account could run yet', () => {
    expect(doneAsksWhere([])).toBe(true);
    expect(doneAsksWhere([account('broken')])).toBe(true);
  });

  it('just closes when an account could already run as the screen opened', () => {
    expect(doneAsksWhere([account('ready')])).toBe(false);
    expect(doneAsksWhere([account('broken'), account('ready')])).toBe(false);
    // At its usage limit is still set up (her case that evening).
    expect(doneAsksWhere([account('limited')])).toBe(false);
  });

  it('is read once, as the screen opens, not after the new account lands', () => {
    const src = fs.readFileSync(new URL('../renderer/src/components/CloudSetup.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/const firstSetup = useRef\(doneAsksWhere\(cloud\.accounts \|\| \[\]\)\)/);
    expect(src).toMatch(/onClick=\{\(\) => \(firstSetup\.current \? setWhere\(true\) : onClose\(\)\)\}/);
  });
});
