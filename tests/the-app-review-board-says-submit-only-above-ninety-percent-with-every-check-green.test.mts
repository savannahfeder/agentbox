// THE APP REVIEW BOARD SAYS SUBMIT ONLY ABOVE NINETY PERCENT, WITH EVERY CHECK GREEN.
//
// Asked on 2026-11-08 (w-007ab2ab26): something that judges whether the phone
// app's first App Store submission will be accepted, with the odds above 90%
// before it goes in. scripts/app-review-board.mjs runs independent mock
// reviewers (Claude and Codex) and hard checks on what a reviewer meets live:
// the privacy, terms and Help pages and the demo account. A risk counts at the
// highest odds any reviewer gave it, the odds of acceptance are the chance no
// risk fires, and a reviewer that failed to answer or a check that could not
// run is never read as a pass.
import { describe, it, expect } from 'vitest';
import { combine, verdict, parseReview, gateChecks, BAR } from '../scripts/app-review-board.mjs';

const review = (engine, risks, p) => ({ engine, ok: true, risks, p_first_acceptance: p, cannot_verify: [] });

describe('reading a reviewer', () => {
  it('takes the last JSON block it wrote', () => {
    const text = 'thinking...\n```json\n{"risks":[],"p_first_acceptance":0.5}\n```\nmore\n```json\n{"risks":[{"guideline":"2.1","p_reject":0.2}],"p_first_acceptance":0.8,"cannot_verify":["demo"]}\n```';
    expect(parseReview(text)).toEqual({ risks: [{ guideline: '2.1', p_reject: 0.2 }], p_first_acceptance: 0.8, cannot_verify: ['demo'] });
  });
  it('a reply with no JSON is no review', () => {
    expect(parseReview('I could not read the files.')).toBeNull();
  });
  it('odds outside 0 to 1 are no review', () => {
    expect(parseReview('```json\n{"risks":[{"guideline":"1.2","p_reject":3}],"p_first_acceptance":0.9}\n```')).toBeNull();
  });
});

describe('combining reviewers', () => {
  it('a risk counts at the highest odds any reviewer gave it', () => {
    const out = combine([review('codex', [{ guideline: '2.1', p_reject: 0.1 }], 0.9), review('claude', [{ guideline: '2.1(a)', p_reject: 0.3 }], 0.7)]);
    expect(out.risks).toHaveLength(1);
    expect(out.risks[0].p_reject).toBe(0.3);
  });
  it('acceptance is the chance no risk fires, capped by the most doubtful reviewer', () => {
    const out = combine([review('codex', [{ guideline: '2.1', p_reject: 0.1 }, { guideline: '4.8', p_reject: 0.1 }], 0.95)]);
    expect(out.p_accept).toBeCloseTo(0.81, 5);
    const doubtful = combine([review('codex', [], 0.6)]);
    expect(doubtful.p_accept).toBe(0.6);
  });
  it('a reviewer that failed says so and adds nothing', () => {
    const out = combine([{ engine: 'claude', ok: false, error: 'not signed in' }, review('codex', [], 0.95)]);
    expect(out.reviewers).toEqual({ answered: 1, failed: 1 });
    expect(out.p_accept).toBe(0.95);
  });
  it('no reviewer answering is no odds at all', () => {
    expect(combine([{ engine: 'claude', ok: false, error: 'x' }]).p_accept).toBeNull();
  });
});

describe('the verdict', () => {
  const green = [{ name: 'privacy page', ok: true }];
  it('submit at the bar with every check green', () => {
    expect(BAR).toBe(0.9);
    expect(verdict({ p_accept: 0.9, reviewers: { answered: 2, failed: 0 } }, green).submit).toBe(true);
  });
  it('not below the bar', () => {
    expect(verdict({ p_accept: 0.89, reviewers: { answered: 2, failed: 0 } }, green).submit).toBe(false);
  });
  it('not with a check red, or one that could not run, whatever the odds', () => {
    expect(verdict({ p_accept: 0.99, reviewers: { answered: 2, failed: 0 } }, [...green, { name: 'demo', ok: false }]).submit).toBe(false);
    expect(verdict({ p_accept: 0.99, reviewers: { answered: 2, failed: 0 } }, [...green, { name: 'demo', ok: null }]).submit).toBe(false);
  });
  // `--assume` asks what the odds would be once the person's steps are done;
  // odds on things nobody has checked are never a reason to submit.
  it('not while anything is only assumed', () => {
    const d = verdict({ p_accept: 0.99, reviewers: { answered: 2, failed: 0 } }, green, ['the privacy page is live']);
    expect(d.submit).toBe(false);
    expect(d.why.join(' ')).toMatch(/these odds assume 1 thing not yet checked/);
  });
  it('the reviewers are told what is assumed, apart from what was checked', async () => {
    const { reviewerPrompt } = await import('../scripts/app-review-board.mjs');
    const prompt = reviewerPrompt({ listing: {}, notes: '', checks: [], assume: ['the demo account answers'] });
    expect(prompt).toMatch(/ASSUMED TRUE BY SUBMISSION, NOT YET CHECKED:\n- the demo account answers/);
  });
  it('not on one reviewer alone', () => {
    expect(verdict({ p_accept: 0.99, reviewers: { answered: 1, failed: 1 } }, green).submit).toBe(false);
  });
});

describe('the hard checks', () => {
  const page = (body) => async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
  const listing = { privacyPolicyUrl: 'https://x.example/privacy', supportUrl: 'https://x.example/support', marketingUrl: 'https://x.example' };
  it('the web app answering at /privacy is not a privacy policy', async () => {
    const fetchImpl = page('<html><head><meta name="agentbox-cloud" content="{}"></head><body></body></html>');
    const checks = await gateChecks({ listing, fetchImpl, env: {} });
    expect(checks.find((c) => c.name === 'privacy policy is live').ok).toBe(false);
  });
  it('a real policy page passes', async () => {
    const fetchImpl = async (url) => new Response(url.endsWith('/privacy') ? '<h1>Privacy Policy</h1>' : url.endsWith('/terms') ? '<h1>Terms</h1>' : '<h1>Help</h1><p>hello@x.example</p>', { status: 200 });
    const checks = await gateChecks({ listing, fetchImpl, env: {} });
    expect(checks.find((c) => c.name === 'privacy policy is live').ok).toBe(true);
    expect(checks.find((c) => c.name === 'Help page is live, with an email').ok).toBe(true);
  });
  it('no demo account given is a check that could not run, not a pass', async () => {
    const checks = await gateChecks({ listing, fetchImpl: page('<h1>Privacy Policy</h1>'), env: {} });
    expect(checks.find((c) => c.name === 'demo account signs in and has threads').ok).toBeNull();
  });
  it('a page that does not answer fails within its deadline', async () => {
    const fetchImpl = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    const checks = await gateChecks({ listing, fetchImpl, env: {}, deadlineMs: 20 });
    expect(checks.find((c) => c.name === 'privacy policy is live').ok).toBe(false);
  });
});
