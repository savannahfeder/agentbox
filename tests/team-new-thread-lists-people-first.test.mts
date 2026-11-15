// THE NEW THREAD'S TO LIST PUTS THE PEOPLE ON THE TEAM FIRST.
//
// One person opened To and read Claude Code,
// Codex and "Someone new" and decided her teammates were not in it; another
// saw "Auto, Claude Code, Codex, Bug triage lead, Maya, Sofia", the people
// last, under every agent and AI teammate. Measured by reading the menu's
// order in ThreadComposer.tsx: People was the last section drawn.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { toSections } from '../renderer/src/threads/composer-rules.ts';

describe('the order of the To list', () => {
  it('is the people first, then Auto, the agents and the AI teammates', () => {
    expect(toSections({ people: true, auto: true, mates: true, adding: false })).toEqual(['people', 'auto', 'agents', 'mates']);
  });
  it('has no people section on a Mac with nobody else on the team', () => {
    expect(toSections({ people: false, auto: true, mates: true, adding: false })).toEqual(['auto', 'agents', 'mates']);
  });
  it('leaves out Auto and the AI teammates where there are none', () => {
    expect(toSections({ people: true, auto: false, mates: false, adding: false })).toEqual(['people', 'agents']);
  });
  it('is only the people while adding one more person to the message', () => {
    expect(toSections({ people: true, auto: true, mates: true, adding: true })).toEqual(['people']);
  });
});

describe('the menu', () => {
  const card = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
  it('is drawn in that order', () => {
    expect(card).toMatch(/toSections\(\{[^}]*\}\)\.map\(/);
  });
});
