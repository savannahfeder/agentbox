// THE APP STORE LISTING PASSES APPLE'S LIMITS AND PRECHECK'S RULES.
//
// The listing (mobile/store.config.json, pushed with `eas metadata:push`) was
// written on 2026-11-08 for the first App Store submission. fastlane precheck
// checks a listing for words App Review rejects, but it reads the listing from
// App Store Connect and needs an Apple login, so its rules are held here
// instead, with Apple's own length limits and guideline 4.1(c): no other
// company's product name in the app's name, subtitle or keywords. The
// repository is public, so the demo account's login and the review contact
// stay out of it and are added only when the listing is pushed.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const store = JSON.parse(fs.readFileSync(new URL('../mobile/store.config.json', import.meta.url), 'utf8')).apple;
const en = store.info['en-US'];
const listing = [en.title, en.subtitle, en.promoText, en.description, en.releaseNotes, en.keywords.join(' '), store.review.notes].join('\n');

describe('Apple\'s limits', () => {
  it('fits each field', () => {
    expect(en.title.length).toBeLessThanOrEqual(30);
    expect(en.subtitle.length).toBeLessThanOrEqual(30);
    expect(en.promoText.length).toBeLessThanOrEqual(170);
    expect(en.description.length).toBeLessThanOrEqual(4000);
    expect(en.keywords.join(',').length).toBeLessThanOrEqual(100);
    expect(store.review.notes.length).toBeLessThanOrEqual(4000);
  });
  it('points support and privacy at the phone site\'s own pages', () => {
    expect(en.supportUrl).toMatch(/^https:\/\/[^/]+\/support$/);
    expect(en.privacyPolicyUrl).toMatch(/^https:\/\/[^/]+\/privacy$/);
  });
});

describe('precheck\'s rules', () => {
  it('names no other platform', () => {
    expect(listing).not.toMatch(/\b(android|google play|windows phone|blackberry)\b/i);
  });
  it('promises nothing still to come and calls nothing a test or a beta', () => {
    expect(listing).not.toMatch(/coming soon|soon to come|in the future|\bbeta\b|\btest(ing)? (build|version)\b|\btestflight\b/i);
  });
  it('leaves no placeholder', () => {
    expect(listing).not.toMatch(/lorem|ipsum|\{\{|\bTODO\b|\bTBD\b|\bxxx\b/i);
  });
  it('says nothing about Apple, and nothing is free in a way that sells', () => {
    expect([en.title, en.subtitle, en.description, en.promoText].join(' ')).not.toMatch(/\bapple\b|\bfree\b/i);
  });
  it('shows no price', () => {
    expect(listing).not.toMatch(/\$\s?\d|\bper month\b|\/mo\b/i);
  });
});

describe('4.1(c) and 2.3.7', () => {
  it('no other company\'s product in the name, subtitle or keywords', () => {
    const named = [en.title, en.subtitle, ...en.keywords].join(' ');
    expect(named).not.toMatch(/claude|codex|anthropic|openai|chatgpt|gpt|copilot|cursor/i);
  });
});

describe('the public repository', () => {
  it('carries no demo login and no review contact', () => {
    for (const k of ['demoUsername', 'demoPassword', 'firstName', 'lastName', 'email', 'phone']) expect(store.review[k]).toBeUndefined();
  });
});
