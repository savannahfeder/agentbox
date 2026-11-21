// THE MODEL PICKS THE AGENT, SO THE BOX NEVER ASKS WHICH ONE (2026-11-15).
//
// Home's box led with a "Claude Code" chip. It was the To field, and on a Mac
// with Claude Code and Codex it named the program and listed both, beside a
// Model chip that already decides where the run happens. The founder: "the
// model should just determine it. Why don't we get rid of that for everyone?"
//
// So To never names an agent. It is drawn only when there is someone besides
// the agent to send to (people on the team, Auto, AI teammates) or when one is
// already chosen, and then it reads "Agent". Every Recent row in the model menu
// still wears the agent that runs it where there are two, so which program a
// model belongs to stays readable.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { agentChoices, toOffered } from '../renderer/src/threads/composer-rules';
import { ENGINES } from '../shared/engines.mts';

const CLAUDE = ENGINES[0];
const CODEX = ENGINES.find((e) => e.id === 'codex');
const nobody = { people: false, auto: false, mates: false, chosen: false };

describe('whether To is drawn', () => {
  it('is not, with nobody but the agent to send to', () => {
    expect(toOffered(nobody)).toBe(false);
  });

  it('is, with people on the team', () => {
    expect(toOffered({ ...nobody, people: true })).toBe(true);
  });

  it('is, where Auto is on offer', () => {
    expect(toOffered({ ...nobody, auto: true })).toBe(true);
  });

  it('is, with AI teammates', () => {
    expect(toOffered({ ...nobody, mates: true })).toBe(true);
  });

  it('is, when a person or teammate is already chosen', () => {
    expect(toOffered({ ...nobody, chosen: true })).toBe(true);
  });
});

describe('the model menu still says which agent runs a model', () => {
  it('has both agents to tag on a Mac with two', () => {
    expect(agentChoices([CLAUDE, CODEX]).map((a) => a.label)).toEqual(['Claude Code', 'Codex']);
  });

  it('tags nothing on a Mac with one', () => {
    expect(agentChoices([CLAUDE])).toEqual([]);
    expect(agentChoices(undefined)).toEqual([]);
  });
});

describe('the box', () => {
  const card = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');

  it('never names Claude Code or Codex on To, nor lists them in its menu', () => {
    expect(card).not.toContain('agentWordFor(');
    expect(card).not.toMatch(/agents\.map\(\(a\) =>/);
    expect(card).not.toMatch(/tc-row-label">Claude Code</);
  });

  it('asks the rule whether to draw To', () => {
    expect(card).toContain('toOffered(');
  });

  it('tags a Recent row with its agent only where there are two', () => {
    expect(card).toContain('engineTags');
  });

  // The All models columns are headed by the agent already, so a row there
  // wears no tag. `.map(modelRow)` would hand the row its INDEX as the tag.
  it('never hands a model row the index as its tag', () => {
    expect(card).not.toMatch(/\.map\(modelRow\)/);
  });
});
