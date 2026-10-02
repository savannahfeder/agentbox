// THE LAST SCREEN OF THE FIRST RUN: her Claude Code agents.
//
// names three different things on a Mac and only one of them has two scopes
// that are literally all-projects and this-project, which is why the screen is
// built on the agent FILES. What this file holds is the reading of those files
// and the shape of the screen. The fixtures are her real eight, read off her
// Mac on 08-21 with the same module, so the day Claude Code changes its front
// matter this fails rather than quietly drawing eight rows with no names on
// them.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentTitle, firstFromBody, oneLine, parseAgentFile, readAgentFiles } from '../main/agent-files.mjs';
import { NAME } from '../shared/product-name.mjs';
import {
  anyAgents, COPY, BEAT, N_BEATS, forcedStep,
} from '../renderer/src/onboarding.ts';

// One of hers, ~/.claude/agents/leon-okafor-qa.md, first four lines.
const REAL = `---
name: leon-okafor-qa
description: QA agent that embodies the persona of Leon Okafor — a 22-year-old Nigerian-American YC founder being onboarded to ${NAME}. Use this agent to test the ${NAME} app from a real user's perspective.
tools: Bash, mcp__Claude_in_Chrome__computer
---

# Leon Okafor — ${NAME} Onboarding QA Agent
`;

describe('reading an agent file', () => {
  it('takes the name and the description out of the front matter', () => {
    const a = parseAgentFile(REAL, '/x/leon-okafor-qa.md');
    expect(a.name).toBe('leon-okafor-qa');
    expect(a.description.startsWith('QA agent that embodies')).toBe(true);
  });

  it('keeps a file with no front matter, named after itself', () => {
    const a = parseAgentFile('# just a heading\n', '/x/reviewer.md');
    expect(a.name).toBe('reviewer');
  });

  it('follows a description that wraps onto its own indented lines', () => {
    const a = parseAgentFile('---\nname: x\ndescription: one\n  two\ntools: Bash\n---\n', '/x/x.md');
    expect(a.description).toBe('one two');
    expect(a.name).toBe('x');
  });

  it('shows the first sentence and no more', () => {
    expect(oneLine('Short one. Second sentence here.')).toBe('Short one.');
    expect(oneLine('a'.repeat(200)).endsWith('...')).toBe(true);
    expect(oneLine('')).toBe('');
  });

  // Five of her eight open "Use this agent to ...", and four of those in a
  // column is four rows that say nothing until the fourth word.
  it('drops the instruction to Claude at the front of a description', () => {
    expect(oneLine('Use this agent to review the docs.')).toBe('Review the docs.');
    expect(oneLine('Use this skill to check the build.')).toBe('Check the build.');
    // Beheading this one leaves "after completing ...", so it is left alone.
    expect(oneLine('Use this skill after completing a change.')).toBe('Use this skill after completing a change.');
  });

  // "Leon Okafor Qa" is not what she called it, and a screen that renames her
  // own agents is worse than one that shows the file name raw.
  it('says the name the way she does', () => {
    expect(agentTitle('leon-okafor-qa')).toBe('Leon Okafor QA');
    expect(agentTitle('docs-reviewer')).toBe('Docs Reviewer');
    expect(agentTitle('Sketch Agent')).toBe('Sketch Agent');
  });
});

describe('both of her scopes, off a real folder tree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-'));
  fs.mkdirSync(path.join(root, 'home', '.claude', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(root, 'proj', '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(root, 'home', '.claude', 'agents', 'leon-okafor-qa.md'), REAL);
  fs.writeFileSync(path.join(root, 'home', '.claude', 'agents', 'notes.txt'), 'not an agent');
  fs.writeFileSync(path.join(root, 'proj', '.claude', 'agents', 'docs-reviewer.md'),
    '---\nname: docs-reviewer\ndescription: Review the docs against the code.\n---\n');

  it('reads the home folder as every project and the project folder as this one', () => {
    const found = readAgentFiles({ home: path.join(root, 'home'), folder: path.join(root, 'proj') });
    expect(found.user.map((a) => a.name)).toEqual(['leon-okafor-qa']);
    expect(found.project.map((a) => a.name)).toEqual(['docs-reviewer']);
    expect(found.user[0].scope).toBe('all');
    expect(found.project[0].scope).toBe('project');
    expect(found.user[0].title).toBe('Leon Okafor QA');
  });

  // 29 of her 30 dev folders have no agents of their own, so this is the
  // ordinary case and not the edge one.
  it('is not an error for a project to have none of its own', () => {
    const found = readAgentFiles({ home: path.join(root, 'home'), folder: path.join(root, 'nothing-here') });
    expect(found.project).toEqual([]);
    expect(found.user.length).toBe(1);
  });

  it('is not an error for a Mac to have none at all', () => {
    const found = readAgentFiles({ home: path.join(root, 'empty'), folder: null });
    expect(found).toEqual({ user: [], project: [] });
  });
});

describe('the screen', () => {
  const found = {
    user: [{ name: 'a', title: 'A', line: '', scope: 'all', path: '/h/a.md' }],
    project: [{ name: 'b', title: 'B', line: '', scope: 'project', path: '/p/b.md' }],
  };

  /* * THE SWITCH THIS BLOCK USED TO TEST IS DELETED.

     Six tests went with it, and each one is here as the rule it held so the
     rule is not lost with the code:

       draws a group per scope, every-project first
       offers both sides of the switch even when one is empty
         `agentGroups`. The card has a section per inbox the rows can land in.
         On her own Mac on 08-26 that was eight, not two, and two of the eight
         were folders no project pointed at, which the switch could not reach at
         all. Both sides always drawn is a rule about a control that is gone.
       opens on every-project, and on the project only when the home folder is
       empty
         `scopeAtOpen`. There are no sides to open on.
       opens with everything she has ticked
       opens on what she took last time when she walks it again
         `chosenAtOpen`. The card opens with NOTHING ticked. She approved that
         on 08-26 and it is what makes one project one press; a card that opens
         with sixteen ticked is a card you have to untick fifteen times.
       ticks and unticks, and what is saved reads in the order she saw it
         `toggleAgent`, which ticked by NAME. The card ticks by PATH, because
         two folders on one Mac can both hold a `code-reviewer`.

     What replaced each of them is in tests/a-project-is-a-thing-you-can-tick
     and tests/importing-agents-has-its-own-row, against the card that is now
     drawn in both places.
  */

  // Nothing at all in these two folders is half of what decides whether the
  // last card appears. The other half is whether any other folder on the Mac
  // has agents in it, which the card can reach and this cannot see.
  it('knows when there is nothing in her home folder or this project', () => {
    expect(anyAgents(found)).toBe(true);
    expect(anyAgents({ user: [], project: [] })).toBe(false);
  });
});

describe('where it sits in the walk', () => {
  // IT IS NOT A SCREEN ANY MORE, IT IS PART OF THE ENDING.It was the eighth of
  // ten for a day, which put a full screen form between closing her first task
  // and clearing the three examples, and the tenth for a few hours, which put
  // a form between the walk and its own ending. Now the finish card asks it.
  // It was the tenth and last dot until 2026-08-23, when five screens of
  // introduction went in front of the app. It is still the last one, which is
  // the half of this that is hers.
  it('is on the finish card, which is the last dot', () => {
    // Eighteen since w-ec62ab6b38 (2026-09-28) took the note beat out, and
    // nineteen since 2026-10-01, when who a thread is for became its own beat.
    expect(N_BEATS).toBe(19);
    expect(BEAT.done).toBe(N_BEATS);
    expect(BEAT.landed).toBe(N_BEATS);
    expect(BEAT.answer).toBe(13);
    // There is no beat of its own left for it to sit on.
    expect(BEAT.agents).toBeUndefined();
  });

  it('comes after the inbox is cleared and after ⌘K', () => {
    expect(BEAT.clear).toBeLessThan(BEAT.done);
    expect(BEAT.command).toBeLessThan(BEAT.done);
    // And there is no beat between them any more. The card that said she was
    // at inbox zero stood there until 2026-08-23, when she asked for it to go.
    expect(BEAT.zero).toBeUndefined();
  });

  it('shares the card\'s one button, so nothing is asked after the confetti', () => {
    // The screen had a Finish of its own and the celebration came after it,
    // which is a celebration followed by one more form. One card, one button,
    // and the button is her sentence.
    expect(COPY.finishGo).toBe('Open my inbox');
    expect(COPY.agentsFinish).toBe(undefined);
  });

  it('opens with ?firstrun=done, and the old step name is refused', () => {
    expect(forcedStep('done')).toBe('done');
    expect(forcedStep('agents')).toBe(null);
    expect(forcedStep('nonsense')).toBe(null);
  });

  // Every word of the offer is one sentence, because the walk's other screens
  // are and because a paragraph on a finality scene is not one.
  it('says one thing per line', () => {
    for (const k of ['agentsOffer', 'agentsRead', 'agentsNoneAll', 'agentsNoneHere',
      'finishHead', 'finishLine']) {
      expect(COPY[k].length).toBeLessThan(100);
    }
  });

  // Two sentences became one, and the one that stayed is the one at the foot.
  // The line that IS over the list now is not that sentence coming back: the
  // headline it used to live under is deleted, so without it the list is a
  // column of names on a celebration card with nothing saying what it is.
  //
  // AND ON 2026-08-24 THE LINE OVER THE LIST BECAME THE CARD'S OWN LINE. AND ON
  // 2026-08-27 THE LIST MOVED TO THE CARD SHE APPROVED.So the walk's own
  // `.fr-offer` block is gone and <ImportAgents> is what draws her agents here.
  // The rule this test has always been about survives the move unchanged: ONE
  // line over the list and ONE under it. Over is `agentsOffer`, drawn by the
  // import card only when it is inside the walk and only on the door screen.
  // Under is `agentsRead`, drawn once, on the choose screen.
  it('keeps one line over the list and one under it, and no more', () => {
    const tsx = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'renderer/src/components/Onboarding.tsx'), 'utf8');
    const ia = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'renderer/src/components/ImportAgents.tsx'), 'utf8');
    // The walk's card draws its own headline and its own one line, and no list.
    const card = tsx.slice(tsx.indexOf('className="fr-finish-head"'), tsx.indexOf('className="fr-finish-go"'));
    expect(card.split('card.line').length - 1).toBe(1);
    expect(card.includes('className="fr-offer"')).toBe(false);
    expect(card.includes('COPY.agentsClause')).toBe(false);
    // Her agents are on the import card, handed the one line to say over them.
    expect(tsx).toMatch(/if \(!card\.blocked\) \{/);
    expect(tsx).toMatch(/line: COPY\.agentsOffer,/);
    // Drawn once, over the doors, never repeated on the choose screen where
    // every section prints the real folder it was read out of, and NOT AT ALL
    // when there are no agents on the Mac: a line reading "these are the
    // agents already on this Mac" over nothing is the contradiction this
    // whole file is about.
    expect(ia.split('walk.line').length - 1).toBe(1);
    expect(ia).toContain("{walk && screen === 'door' && some && <p className=\"ia-offer\">{walk.line}</p>}");
    expect(ia.split('COPY.agentsRead').length - 1).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TAKE WHAT WE CAN GET.
//
// All eight of her own files have a real front matter description, so this is
// the case her Mac does NOT show and the reason it has to be tested rather
// than looked at: a hand written agent file with a heading and nothing else.

describe('taking whatever information the file has', () => {
  it('falls back to the first heading when there is no description', () => {
    const a = parseAgentFile('---\nname: x\ntools: Bash\n---\n\n# Reviews the docs\n\nBody.\n', '/x/x.md');
    expect(a.description).toBe('Reviews the docs');
  });

  it('falls back to the first line of prose when there is no heading either', () => {
    const a = parseAgentFile('---\nname: y\n---\n\nYou review pull requests.\n', '/x/y.md');
    expect(a.description).toBe('You review pull requests.');
  });

  it('reads the body of a file with no front matter at all', () => {
    expect(parseAgentFile('# Just a heading\n\nprose\n', '/x/r.md').description).toBe('Just a heading');
  });

  // A row reading "```bash" or "---" says less than an empty row does.
  it('never takes a code fence, a rule, a bullet or a quote', () => {
    expect(firstFromBody('```bash\nls -la\n```\n\nReal words.\n')).toBe('Real words.');
    expect(firstFromBody('---\n\n- a bullet\n> a quote\n\nReal words.\n')).toBe('Real words.');
    expect(firstFromBody('')).toBe('');
    expect(firstFromBody('```\nonly code\n```\n')).toBe('');
  });

  it('skips a heading that is only the name again and takes the sentence under it', () => {
    expect(firstFromBody('# Docs Reviewer\n\nChecks the docs.\n', 'docs-reviewer'))
      .toBe('Checks the docs.');
    // With nothing under it, the name is still better than a blank row.
    expect(firstFromBody('# Docs Reviewer\n', 'docs-reviewer')).toBe('Docs Reviewer');
  });

  // Most hand written agent files open `# Docs Reviewer`, and the row's own
  // title underneath it in smaller grey type is not information.
  it('leaves the line empty when all it could get was the name again', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-fb-'));
    const home = path.join(dir, '.claude', 'agents');
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'docs-reviewer.md'), '# Docs Reviewer\n');
    fs.writeFileSync(path.join(home, 'plan-checker.md'), '---\nname: plan-checker\n---\n\n# Plan checker.\n');
    fs.writeFileSync(path.join(home, 'useful.md'), '# Useful\n\nChecks the build before you push.\n');
    const { user } = readAgentFiles({ home: dir, folder: null });
    const by = Object.fromEntries(user.map((a) => [a.name, a.line]));
    expect(by['docs-reviewer']).toBe('');
    expect(by['plan-checker']).toBe('');
    // Its heading is the name again, so the sentence under it is taken instead.
    expect(by['useful']).toBe('Checks the build before you push.');
  });
});
