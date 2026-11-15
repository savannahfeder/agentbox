// THE INSTRUCTIONS PAGE IS ONE PAGE, AND THE PROJECT IS A SWITCH IN ITS HEADING.
//
// Why this exists: the instructions lived in five places. Two pill tabs on the
// Instructions page, a switch and a second box inside one of them, the task
// brief behind Advanced, and each project's own rules on that project's page.
// Nothing showed which an agent reads. Three shapes were drawn in the real app
// and "one page" was picked: a heading that names who the page is for, a short
// list of sections on the left, and every section rendered as a page you read,
// with Edit to write in it.
//
// Two corrections came with the pick, and each is a test below:
//  - the switch has to LOOK clickable. A dotted underline did not. A solid
//    underline with an arrow after the words was approved.
//  - a page "for North Sound" that also showed sections tagged "all projects"
//    contradicted itself. So the scope is exclusive: every project shows the
//    shared sections, a project shows only its own.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVERY, scopeChoices, resolveScope, scopeWords, sectionsFor, startsWriting } from '../renderer/src/instruction-scope.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const projects = [
  { slug: 'north-sound', name: 'North Sound' },
  { slug: 'lantern', name: 'Lantern' },
];

describe('the switch in the heading', () => {
  it('offers every project first, then each project in her order', () => {
    expect(scopeChoices(projects).map((c) => c.label)).toEqual(['Every project', 'North Sound', 'Lantern']);
    expect(scopeChoices(projects)[0].id).toBe(EVERY);
  });

  it('offers only every project when there are no projects yet', () => {
    expect(scopeChoices([]).map((c) => c.id)).toEqual([EVERY]);
  });

  it('says the words the heading finishes with', () => {
    expect(scopeWords(EVERY, projects)).toBe('every project');
    expect(scopeWords('lantern', projects)).toBe('Lantern');
  });

  it('falls back to every project when the chosen one is gone', () => {
    expect(resolveScope('kestrel', projects)).toBe(EVERY);
    expect(resolveScope('north-sound', projects)).toBe('north-sound');
    expect(resolveScope(null, projects)).toBe(EVERY);
  });

  it('is drawn with a solid underline and an arrow, never the dotted one', () => {
    const css = read('renderer/src/workspace-navigation.css');
    const rule = css.match(/\.instr-scope-word \{([^}]*)\}/);
    expect(rule, 'no rule for the switch words').toBeTruthy();
    expect(rule[1]).toMatch(/text-decoration:\s*underline solid/);
    expect(rule[1]).not.toContain('dotted');
    const page = read('renderer/src/components/InstructionSettings.tsx');
    expect(page).toContain('className="instr-scope-arrow"');
    expect(page).toContain('Instructions for ');
  });
});

describe('each scope shows only its own instructions', () => {
  it('shows the combined instructions and ADHD mode for every project', () => {
    expect(sectionsFor(EVERY)).toEqual(['rules', 'adhd']);
  });

  it('shows only the project file for a project, nothing shared', () => {
    expect(sectionsFor('north-sound')).toEqual(['project']);
  });

  it('never tags a section with the projects it applies to', () => {
    const page = read('renderer/src/components/InstructionSettings.tsx');
    expect(page).not.toMatch(/All projects/i);
    expect(page).not.toMatch(/This project/);
  });
});

describe('a section is a page you read, and Edit makes it a page you write', () => {
  it('opens an empty section straight into writing, a written one as a page', () => {
    expect(startsWriting('')).toBe(true);
    expect(startsWriting('  \n ')).toBe(true);
    expect(startsWriting('## Never\nRestart the app.')).toBe(false);
  });

  it('renders what she wrote as markdown', () => {
    expect(read('renderer/src/components/InstructionSettings.tsx')).toContain('<ReactMarkdown');
  });
});

describe('a project has one place for its instructions', () => {
  it('drops the box from the project page and opens this page on that project instead', () => {
    const settings = read('renderer/src/components/Settings.tsx');
    expect(settings).not.toContain('<Instructions project={current}');
    expect(settings).toContain("openInstructions(current.slug)");
  });
});
