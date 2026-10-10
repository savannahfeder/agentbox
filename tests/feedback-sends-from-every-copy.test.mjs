// FEEDBACK SENDS FROM EVERY COPY, NOT ONLY THE PACKAGED MAC APP (w-58e758c81e, 2026-10-09).
//
// What broke: the feedback address was only baked into the Mac app that
// scripts/release.mjs builds. The two installs the README offers carried none:
// the npm package (0.1.12, checked on npm) and a copy run from a git clone. On
// those, someone wrote their feedback, pressed Send and was told "Feedback is
// not set up in this copy of Agentbox", and what they wrote was lost. Only a
// copy whose own zero.config.json held the address could send.
//
// Measured: feedbackUrl({}, undefined, {}) in a source checkout, which is what
// both of those installs run, answered null. The server function itself was
// live (an empty POST answered 400 "empty", not 503 "not configured").
//
// The fix: the address of the server function ships in the code. It is not
// anybody's inbox; who the mail reaches stays a secret on the function.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { FEEDBACK_ADDRESS, feedbackUrl, sendFeedback } from '../main/feedback.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('a copy with no settings of its own', () => {
  it('has the feedback server address in the code', () => {
    expect(FEEDBACK_ADDRESS).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/feedback$/);
  });

  it('sends there from source, which is what npx and a git clone both run', () => {
    // The checkout's package.json carries no baked address, like the npm package.
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.bakedFeedbackUrl).toBeUndefined();
    expect(feedbackUrl({}, undefined, {})).toBe(FEEDBACK_ADDRESS);
  });

  it('is not told feedback is not set up', async () => {
    const calls = [];
    const fetchImpl = async (url) => { calls.push(url); return { ok: true }; };
    const out = await sendFeedback({ url: feedbackUrl({}, undefined, {}), payload: { text: 'hi', files: [] }, fetchImpl });
    expect(out).toEqual({ ok: true });
    expect(calls).toEqual([FEEDBACK_ADDRESS]);
  });
});

describe('what still outranks it', () => {
  it('the address baked into a packaged app', () => {
    expect(feedbackUrl({}, 'https://baked.example/f', {})).toBe('https://baked.example/f');
  });
  it('a feedbackUrl in the config', () => {
    expect(feedbackUrl({ feedbackUrl: 'https://mine.example/f' }, undefined, {})).toBe('https://mine.example/f');
  });
  it('a blank config value does not hide the shipped address', () => {
    expect(feedbackUrl({ feedbackUrl: '  ' }, undefined, {})).toBe(FEEDBACK_ADDRESS);
  });
});

describe('the npm package', () => {
  it('packs the file that holds the address', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.files).toContain('main/**/*.mjs');
  });
});
