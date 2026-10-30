// A FOLDER CALLED `greet-js` IS NOT A PROJECT CALLED "Greet Js".
//
// QA on the Linux box, 2026-10-28 (F-137): the project chip on the first-task
// screen read "Greet Js". Reading a path as a name capitalised every word, so
// the two letters that are an acronym came back as a word nobody writes.
//
// The agent rows had already hit this and fixed it on their own — "Leon Okafor
// Qa" is not what she called the file — and kept a list of the words that stay
// shouted in main/agent-files.mjs. Project names never saw that list, so the
// same app wrote "Leon Okafor QA" on one row and "Greet Js" on another. There
// is one list now, and all three namers read it.
//
// Measured on the three functions that turn a file name into a name on screen.

import { describe, expect, it } from 'vitest';

import { SHOUTED, titleFromFileName } from '../shared/name-words.mjs';
import { nameFromFolder } from '../renderer/src/onboarding.ts';
import { projectNameFor } from '../renderer/src/agent-import-card.ts';
import { agentTitle } from '../main/agent-files.mjs';

describe('1. the words that stay shouted', () => {
  it('shouts the ones a repository folder actually ends in', () => {
    expect(titleFromFileName('greet-js')).toBe('Greet JS');
    expect(titleFromFileName('range-utils-ts')).toBe('Range Utils TS');
    expect(titleFromFileName('payments-api')).toBe('Payments API');
    expect(titleFromFileName('design-ui')).toBe('Design UI');
    expect(titleFromFileName('leon-okafor-qa')).toBe('Leon Okafor QA');
  });

  it('leaves an ordinary word alone, which is nearly every word', () => {
    expect(titleFromFileName('agentbox-team')).toBe('Agentbox Team');
    expect(titleFromFileName('side-quest')).toBe('Side Quest');
    // "is" and "as" are words, not acronyms, and a short list is only safe
    // while it stays a list of things people write in capitals.
    expect(titleFromFileName('as-is-greeter')).toBe('As Is Greeter');
    expect(SHOUTED.has('is')).toBe(false);
    expect(SHOUTED.has('as')).toBe(false);
    expect(SHOUTED.has('go')).toBe(false);
  });

  it('still never touches more than the first letter of a word', () => {
    expect(titleFromFileName('foo-BAR-baz')).toBe('Foo BAR Baz');
    expect(titleFromFileName('iOS-app')).toBe('IOS App');
    expect(titleFromFileName('2048')).toBe('2048');
  });

  it('and takes hyphens, underscores, dots and doubled spaces apart', () => {
    expect(titleFromFileName('side_quest')).toBe('Side Quest');
    expect(titleFromFileName('side.quest')).toBe('Side Quest');
    expect(titleFromFileName('--weird--')).toBe('Weird');
    expect(titleFromFileName('my  app')).toBe('My App');
    expect(titleFromFileName('')).toBe('');
  });
});

describe('2. every screen that names something after a file reads the same list', () => {
  it('names a project off its folder the way the chip has to read', () => {
    expect(nameFromFolder('/workspace/agentbox-test-repos/greet-js')).toBe('Greet JS');
    expect(nameFromFolder('/Users/leon/dev/payments-api/')).toBe('Payments API');
    // The names the walk already wrote are unchanged, which is the point of
    // keeping the rule one rule.
    expect(nameFromFolder('/Users/leon/Desktop/dev/agentbox-team')).toBe('Agentbox Team');
  });

  it('names an imported project the same as the walk would', () => {
    expect(projectNameFor({ name: 'greet-js' })).toBe('Greet JS');
    expect(projectNameFor({ name: 'sidecar-desktop' })).toBe('Sidecar Desktop');
    // A name somebody wrote themselves is still kept exactly as they wrote it.
    expect(projectNameFor({ name: 'My Thing' })).toBe('My Thing');
  });

  it('names an agent file the way it already did', () => {
    expect(agentTitle('leon-okafor-qa')).toBe('Leon Okafor QA');
    expect(agentTitle('greet-js')).toBe('Greet JS');
    expect(agentTitle('Docs Reviewer')).toBe('Docs Reviewer');
  });
});
