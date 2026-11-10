// THE CLOUD SERVER HAS ROOM FOR EVERY RUN A COMPUTER IS WATCHING.
//
// A computer reads a cloud run's output with a call that waits up to 20 s, so
// each run it watches holds about one of the function's calls open. The deploy
// reserved 200 calls at once for everyone, so one Max person's 200 runs filled
// it and every other call was refused 429. The reservation was also allowed to
// fail without a word, which it does on an account whose Lambda limit is under
// 300. Measured with scripts/cloud-load-test.mjs --standin --steps 200.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { reservedConcurrency, concurrencyShortfall, ONE_MAX_PERSON } from '../scripts/cloud-gateway-setup.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';

describe('how many calls at once the deploy reserves for the cloud server', () => {
  it('takes all the account allows but the 100 Lambda keeps back, up to 900', () => {
    expect(reservedConcurrency(1000)).toBe(900);
    expect(reservedConcurrency(5000)).toBe(900);
    expect(reservedConcurrency(400)).toBe(300);
    expect(reservedConcurrency(301)).toBe(201);
  });

  it('reserves nothing on an account too small to reserve from, rather than failing', () => {
    expect(reservedConcurrency(100)).toBe(0);
    expect(reservedConcurrency(10)).toBe(0);
    expect(reservedConcurrency(undefined)).toBe(0);
  });

  it('says so when the account cannot hold one Max person and someone else besides', () => {
    expect(ONE_MAX_PERSON).toBe(PLANS.max.agents);
    expect(concurrencyShortfall(1000)).toBeNull();
    expect(concurrencyShortfall(10)).toMatch(/10 .*Service Quotas/);
    expect(concurrencyShortfall(300)).toMatch(/300/);
  });

  it('is what the deploy reserves, and a refusal is said', () => {
    const setup = fs.readFileSync(new URL('../scripts/cloud-gateway-setup.mjs', import.meta.url), 'utf8');
    expect(setup).not.toMatch(/const CONCURRENCY = 200/);
    expect(setup).toMatch(/reservedConcurrency\(/);
    expect(setup).toMatch(/WARNING: could not reserve/);
    expect(setup).toMatch(/if \(short\) say\(`WARNING/);
  });
});
