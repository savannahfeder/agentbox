// A TESTER'S WEB PROJECT HOLDS WEB CODE (2026-11-11).
//
// The power test laid sample code into each tester's projects by position: the
// first project got the appointments API, the second the web page. Lena's one
// project is "Web app", so her agents were handed a Node API and said so: "Web
// app agent says it has only a Node appointments API", logged as broken in all
// four rounds of w-1e52420829 and counted against the app in her scores.
// Measured in those rounds' reports. A project is now given the sample its
// name reads as, and position only settles a name that says neither.
import { describe, it, expect } from 'vitest';
import { fixtureFor } from '../.claude/skills/power-test/scripts/plan.mjs';

describe('the sample code a tester\'s project is given', () => {
  it('is the web page for a project named as one, wherever it sits', () => {
    for (const name of ['web-app', 'Web app', 'marketing-site', 'Mobile', 'frontend', 'dashboard-ui']) expect(fixtureFor(name, 0)).toBe('web');
  });
  it('is the API for a project named as one, wherever it sits', () => {
    for (const name of ['payments-api', 'API', 'infra', 'data', 'backend-service']) expect(fixtureFor(name, 1)).toBe('api');
  });
  it('alternates by position when the name says neither, as before', () => {
    expect(fixtureFor('outreach', 0)).toBe('api');
    expect(fixtureFor('research', 1)).toBe('web');
  });
  it('does not read a word inside another word', () => {
    expect(fixtureFor('cobweb-notes', 0)).toBe('api');
    expect(fixtureFor('capital', 1)).toBe('web');
  });
});
