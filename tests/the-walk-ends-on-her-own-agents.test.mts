// HER CLAUDE CODE AGENTS, read off their files for the import card.
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
import { agentTitle, firstFromBody, oneLine, parseAgentFile, readAgentFiles } from '../main/agent-files.mts';
import { NAME } from '../shared/product-name.mjs';

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

describe('the import card that draws them', () => {
  // One line over its list, picked by `listLine`, and only when there is a list
  // and it is not a search (w-db6f5e331e, w-e46f2e9cea, w-6418318cd5).
  it('says one line over the list, and none over nothing', () => {
    const ia = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'renderer/src/components/ImportAgents.tsx'), 'utf8');
    expect(ia).toContain('{read && some && !searching && <p className="ia-line">{listLine(threads ?? [], Date.now(), kept.length > 0)}</p>}');
    expect(ia.split('listLine(').length - 1).toBe(1);
    expect(ia).not.toContain('COPY.agentsRead');
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
