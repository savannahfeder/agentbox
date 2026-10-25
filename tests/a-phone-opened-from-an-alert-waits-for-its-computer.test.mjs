// A PHONE OPENED FROM AN ALERT WAITS FOR ITS COMPUTER (2026-10-13).
//
// Reported: "quite often when I click a notification it brings me to a page
// that says [the computer] isn't connected … but if I then open the app from
// my phone, it works fine."
//
// Measured through the live relay the same day: four page requests in a row
// each waited 30 s and came back "did not answer in time", and the fifth
// worked. An alert is tapped at the worst moment for that, the first request
// after a quiet spell. The phone's worker (relay/phone/sw.mjs) showed the
// error page on the first miss. Now opening the app tries again for a short
// while before saying anything, and the page that does say it tries again on
// its own instead of waiting for a tap. Only opening a page is retried: a
// reply or anything else that changes something is never sent twice.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { withPatience, PATIENCE_MS } from '../relay/phone/tunnel.mjs';

const said = (status) => new Response('x', { status });
const clock = () => {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
};

describe('opening the app through the relay', () => {
  it('a computer that answers on the third try is shown, not the error', async () => {
    const answers = [said(503), said(504), said(200)];
    const c = clock();
    const res = await withPatience(async () => answers.shift(), c);
    expect(res.status).toBe(200);
    expect(answers).toHaveLength(0);
  });

  it('an answer at once is not delayed', async () => {
    let tries = 0;
    const c = clock();
    const res = await withPatience(async () => { tries += 1; return said(200); }, c);
    expect(res.status).toBe(200);
    expect(tries).toBe(1);
    expect(c.now()).toBe(0);
  });

  it('a computer that never answers is said in words once the patience runs out', async () => {
    let tries = 0;
    const c = clock();
    const res = await withPatience(async () => { tries += 1; return said(503); }, c);
    expect(res.status).toBe(503);
    expect(tries).toBeGreaterThan(2);
    expect(c.now()).toBeLessThanOrEqual(PATIENCE_MS);
  });

  it('a refusal is not retried: a wrong key will not become right', async () => {
    let tries = 0;
    const res = await withPatience(async () => { tries += 1; return said(400); }, clock());
    expect(res.status).toBe(400);
    expect(tries).toBe(1);
  });

  it('an answer the computer gave, even an error page, is not retried', async () => {
    let tries = 0;
    const res = await withPatience(async () => { tries += 1; return said(404); }, clock());
    expect(res.status).toBe(404);
    expect(tries).toBe(1);
  });
});

describe('the phone\'s worker', () => {
  const sw = fs.readFileSync(new URL('../relay/phone/sw.mjs', import.meta.url), 'utf8');
  it('is patient only when opening a page', () => {
    expect(sw).toMatch(/request\.mode === 'navigate'[\s\S]{0,200}withPatience/);
  });

  it('the not-connected page tries again by itself', () => {
    const tunnel = fs.readFileSync(new URL('../relay/phone/tunnel.mjs', import.meta.url), 'utf8');
    expect(tunnel).toMatch(/http-equiv="refresh"/);
  });
});
