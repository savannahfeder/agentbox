// THE STORE APP PASSES WHAT THE REVIEW BOARD FOUND ON NOV 9.
//
// The app review board (scripts/app-review-board.mjs, four mock reviewers)
// put build 22's odds of first acceptance at 30%. What code could fix:
// - 2.3.6: a page an agent made opened its links inside the app, which reads
//   as unrestricted web access the age rating must declare. Links now open in
//   Safari, and only the page itself loads in the frame.
// - 1.2: Report this thread sent the thread's name and the person's words,
//   not the answer being reported. It now carries the answer.
// - 5.1.1(i): Settings opened the privacy policy on agentbox-phone.pages.dev
//   while the listing names app.agentbox.ac (the same site). The store build
//   now uses the listing's address.
// - 2.3.6: the listing's age rating was 4+ while the Terms require 13.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { pageNavigation } from '../mobile/src/lib/page-navigation';
import { reportText } from '../mobile/src/lib/report';
import { cloudConfig } from '../mobile/app.config';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('a page in the app', () => {
  it('loads itself in the frame', () => {
    expect(pageNavigation({ url: 'about:blank', isTopFrame: true })).toBe('load');
    expect(pageNavigation({ url: 'about:blank#menu', isTopFrame: true })).toBe('load');
  });

  it('opens a link in Safari instead of in the frame', () => {
    expect(pageNavigation({ url: 'https://example.com/', isTopFrame: true })).toBe('open');
    expect(pageNavigation({ url: 'http://example.com/a', isTopFrame: true })).toBe('open');
    expect(pageNavigation({ url: 'mailto:a@b.c', isTopFrame: true })).toBe('open');
  });

  it('never loads another page in a frame inside it, and does not hand it to Safari either', () => {
    expect(pageNavigation({ url: 'https://example.com/', isTopFrame: false })).toBe('block');
  });

  it('is what the frame asks before every navigation', () => {
    expect(read('mobile/src/ui/PageFrame.tsx')).toMatch(/onShouldStartLoadWithRequest=\{[^}]*pageNavigation\(/);
  });
});

describe('a report about a thread', () => {
  it('carries the answer it is about', () => {
    const out = reportText({ ref: 'demo/w-1', title: 'Fix sign-in', answer: 'Something rude' }, 'This is rude');
    expect(out).toBe('Report about thread demo/w-1 ("Fix sign-in")\n\nThis is rude\n\nThe answer reported:\nSomething rude');
  });

  it('keeps a long answer to its first 4000 characters', () => {
    const out = reportText({ ref: 'demo/w-1', title: '', answer: 'x'.repeat(5000) }, 'r');
    expect(out.endsWith('x'.repeat(4000))).toBe(true);
    expect(out).not.toContain('x'.repeat(4001));
  });

  it('with no answer, says only what it said before', () => {
    expect(reportText({ ref: 'demo/w-1', title: '' }, 'r')).toBe('Report about thread demo/w-1\n\nr');
  });

  it('is sent from the thread with its newest answer', () => {
    expect(read('mobile/src/app/thread/[product]/[id].tsx')).toMatch(/pathname: '\/settings\/feedback', params: \{ report:[^\n]*answer:/);
    expect(read('mobile/src/app/settings/feedback.tsx')).toMatch(/answer/);
  });
});

describe('the privacy policy the app opens', () => {
  it('is at the address a build names', () => {
    expect(cloudConfig({ EXPO_PUBLIC_PHONE_SITE: 'https://app.agentbox.ac' }, []).phoneSite).toBe('https://app.agentbox.ac');
  });

  it('is the public site when a build names none', () => {
    expect(cloudConfig({}, []).phoneSite).toMatch(/^https:\/\//);
  });

  it('is the listing\'s address in the store build', () => {
    const eas = JSON.parse(read('mobile/eas.json'));
    const listing = JSON.parse(read('mobile/store.config.json')).apple.info['en-US'].privacyPolicyUrl;
    expect(new URL(listing).origin).toBe(eas.build.store.env.EXPO_PUBLIC_PHONE_SITE);
  });
});

describe('the listing\'s age rating', () => {
  it('is 13+, as the Terms require', () => {
    expect(JSON.parse(read('mobile/store.config.json')).apple.advisory.ageRatingOverride).toBe('THIRTEEN_PLUS');
    expect(read('phone-legal/terms.html')).toMatch(/at least 13 years old/);
  });
});
