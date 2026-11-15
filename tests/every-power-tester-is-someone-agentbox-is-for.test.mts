// EVERY POWER TESTER IS SOMEONE AGENTBOX IS FOR.
//
// What was asked (w-811757c0b5, 2026-10-20): testers that "behave in a way
// that is actually natural", picked "from a pool of people" like the ones
// Agentbox is built for: an engineer at a startup, one at a bigger company, a
// founder, each with different constraints. The pool is a folder of files in
// .claude/skills/power-test/people/, and a file the reader cannot parse would
// quietly give a tester no setup, no day and no work.
//
// Pinned: every file reads with the fields the test runs on, the three people
// named in the ask are there, a name can be picked and an unknown one is
// refused with the list, and no file carries a real address or link.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPeople, pickPeople, projectNamedIn } from '../.claude/skills/power-test/scripts/plan.mjs';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.claude/skills/power-test/people');
const people = readPeople(dir);

describe('the pool of people', () => {
  it('has the startup engineer, the bigger-company engineer and the founder the ask named', () => {
    expect(people.map((p) => p.slug)).toEqual(expect.arrayContaining(['startup-engineer', 'big-company-engineer', 'founder']));
  });

  it('gives everyone what a test runs on', () => {
    for (const p of people) {
      expect(p.name, p.slug).toMatch(/^\S+ \S+/);
      expect(p.role, p.slug).toBeTruthy();
      expect(p.logins, p.slug).toBeGreaterThanOrEqual(1);
      expect(p.logins, p.slug).toBeLessThanOrEqual(4);
      expect(typeof p.codex, p.slug).toBe('boolean');
      expect(typeof p.knowsKeys, p.slug).toBe('boolean');
      expect(p.projects.length, p.slug).toBeGreaterThanOrEqual(1);
      expect(['fast', 'steady', 'between-meetings'], p.slug).toContain(p.pace);
      expect(p.atOnce, p.slug).toBeGreaterThanOrEqual(1);
      expect(p.day.length, p.slug).toBeGreaterThanOrEqual(3);
      expect(p.plate.length, p.slug).toBeGreaterThanOrEqual(5);
    }
  });

  it('carries no real address, link or account', () => {
    for (const f of fs.readdirSync(dir)) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(text, f).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}|https?:\/\/|\/Users\//i);
    }
  });
});

describe('the inbox a person starts with', () => {
  const projects = ['API', 'Web app', 'Mobile', 'Infra', 'Data'];
  it('files an old task under the project it names', () => {
    expect(projectNamedIn('In Infra, why did last night\'s deploy take 40 minutes?', projects)).toBe(3);
    expect(projectNamedIn('Audit the API for endpoints missing auth checks', projects)).toBe(0);
    expect(projectNamedIn('Pick a feature flag library for the Web app', projects)).toBe(1);
  });

  it('leaves a task that names none, or names one only inside another word, to be spread across them', () => {
    expect(projectNamedIn('Update dependencies', projects)).toBeUndefined();
    expect(projectNamedIn('Rapid prototyping of the database layer', projects)).toBeUndefined();
  });
});

describe('picking who tests', () => {
  it('picks by name, in the order given', () => {
    expect(pickPeople('founder,cto', people).map((p) => p.slug)).toEqual(['founder', 'cto']);
  });

  it('refuses a name nobody has, and lists the pool', () => {
    expect(() => pickPeople('founder,ceo', people)).toThrow(/nobody called "ceo". The pool: .*startup-engineer/);
  });

  it('picks N different people at random, never more than there are', () => {
    const two = pickPeople('random:2', people, () => 0);
    expect(new Set(two.map((p) => p.slug)).size).toBe(2);
    expect(pickPeople('random:99', people)).toHaveLength(people.length);
    expect(pickPeople('all', people)).toHaveLength(people.length);
  });
});
