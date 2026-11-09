// THE IPHONE APP IS WALKED ON A SIMULATOR WITH NO ONE AT A PHONE.
//
// On 2026-11-08 the founder found, by hand on TestFlight build 21, that a
// reply in a thread was answered by the review computer in 4 seconds and the
// phone never showed the answer; the browser build of the same code showed it
// in 18. Every walk until then ran in a browser, so nothing caught what only
// the iPhone does. This walk signs in as the demo account on an iPhone
// simulator on GitHub's Macs and waits for real answers to a reply and a new
// thread. These checks hold its shape: it ends, it reads the password only
// from a secret, and it waits for answers rather than for its own words.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import yaml from 'js-yaml';

const root = new URL('..', import.meta.url);
const workflow = yaml.load(fs.readFileSync(new URL('.github/workflows/iphone-walk.yml', root), 'utf8'));
const flowText = fs.readFileSync(new URL('mobile/.maestro/review-walk.yml', root), 'utf8');
const [head, body] = flowText.split(/^---$/m).map((s) => yaml.load(s));
const job = workflow.jobs.walk;

describe('the iPhone walk job', () => {
  it('runs on a Mac and ends', () => {
    expect(job['runs-on']).toMatch(/^macos-/);
    expect(job['timeout-minutes']).toBeGreaterThan(0);
    expect(job['timeout-minutes']).toBeLessThanOrEqual(60);
  });

  it('is started by hand, never by a push or a pull request', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
  });

  it('reads the demo password only from a secret, and every download ends', () => {
    const steps = job.steps;
    const withPassword = steps.filter((s) => JSON.stringify(s).includes('REVIEW_PASSWORD'));
    for (const s of withPassword) if (s.env?.REVIEW_PASSWORD) expect(s.env.REVIEW_PASSWORD).toBe('${{ secrets.REVIEW_PASSWORD }}');
    for (const s of steps.filter((x) => /curl /.test(x.run ?? ''))) {
      for (const line of s.run.split('\n').filter((l) => l.includes('curl '))) expect(line).toMatch(/--max-time \d+/);
    }
  });

  it('runs the walk it names', () => {
    expect(workflow.on.workflow_dispatch.inputs.flow.default).toBe('mobile/.maestro/review-walk.yml');
  });

  it('uploads its screens only sealed, because they can show the demo login on a public repository', () => {
    const uploads = job.steps.filter((s) => String(s.uses ?? '').startsWith('actions/upload-artifact'));
    expect(uploads.map((s) => s.with.path)).toEqual(['sealed/']);
    const seal = job.steps.find((s) => s.name === 'Seal the screens').run;
    expect(seal).toContain('rm -rf walk');
    expect(seal).toContain('pkeyutl -encrypt -pubin -keyform DER');
    // A public key, as one line of DER: the opening bytes of an RSA SubjectPublicKeyInfo.
    expect(job.steps.find((s) => s.name === 'Seal the screens').env.WALK_KEY).toMatch(/^MIIB[A-Za-z0-9+/=]+$/);
  });

  it('keeps every screenshot the walk took', () => {
    const walk = job.steps.find((s) => s.name === 'Walk it').run;
    expect(walk).toMatch(/find [^\n]*\.maestro[^\n]*-name '\*\.png'/);
  });
});

describe('the walk', () => {
  it('is the store app', () => {
    const config = fs.readFileSync(new URL('mobile/app.config.ts', root), 'utf8');
    expect(config).toContain(head.appId);
  });

  it('finds the sign-in boxes by ids the screen gives them, never by where they sit', () => {
    const signIn = fs.readFileSync(new URL('mobile/src/app/sign-in.tsx', root), 'utf8');
    const ids = body.filter((s) => s.tapOn?.id).map((s) => s.tapOn.id);
    expect(ids).toEqual(expect.arrayContaining(['sign-in-email', 'sign-in-password']));
    for (const id of ids) expect(signIn).toContain(`testID="${id}"`);
    expect(body.some((s) => s.tapOn?.point)).toBe(false);
  });

  it('types the password from the job, never from the file', () => {
    expect(body.filter((s) => s.inputText).map((s) => s.inputText)).toContain('${REVIEW_PASSWORD}');
  });

  it('waits for an answer to a reply and to a new thread, words its own message does not hold', () => {
    const typed = body.filter((s) => s.inputText).map((s) => s.inputText).join(' ');
    const awaited = body.filter((s) => s.extendedWaitUntil?.visible).map((s) => s.extendedWaitUntil.visible);
    for (const word of ['PARIS', 'BLUE']) {
      expect(awaited.some((v) => v.includes(word))).toBe(true);
      expect(typed).not.toContain(word);
    }
  });

  it('fails when a new thread loses itself', () => {
    expect(body.some((s) => s.assertNotVisible === 'This thread is not on your phone.')).toBe(true);
  });
});
