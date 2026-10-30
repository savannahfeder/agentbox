// The first task screen asked for a project folder and a task at once. Send
// was dead until a folder was chosen, so somebody who typed a task and pressed
// Send got nothing, and the folder window that followed came with no reason.
// Which project is right often depends on the task, so the task is asked
// first and the project on a screen of its own after it. Found walking the
// onboarding as a new user, 2026-10-29.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { previousScreen, stepsFor } from '../renderer/src/first-run';

const source = fs.readFileSync(new URL('../renderer/src/components/FirstRun.tsx', import.meta.url), 'utf8');
const between = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

describe('the steps', () => {
  it('end on the project, after the task', () => {
    expect(stepsFor({ chats: 0 })).toEqual(['task', 'where']);
    expect(stepsFor({ chats: 2 })).toEqual(['chats', 'task', 'where']);
  });

  it('go back from the project to the task, keeping what was typed', () => {
    expect(previousScreen('where', { chats: 0 })).toBe('task');
    expect(previousScreen('where', { chats: 2 })).toBe('task');
    expect(previousScreen('task', { chats: 0 })).toBe('welcome');
  });
});

describe('the task screen', () => {
  const task = between("{screen === 'task' && (", "{screen === 'where' && (");

  it('asks only for the task', () => {
    expect(task).toContain('What’s the first task you want to give your agent?');
    expect(task).not.toContain('chooseAnother');
    expect(task).not.toContain('Choose project folder');
  });

  it('moves on as soon as there is a task, with no folder needed', () => {
    expect(task).toMatch(/disabled=\{!text\.trim\(\) \|\| busy\}/);
    expect(between('const next = useCallback', '}, [')).toContain("go('where')");
  });
});

describe('the project screen', () => {
  const where = between("{screen === 'where' && (", '</div>\n  );\n}');

  it('asks which project the task is for, and shows the task', () => {
    expect(where).toContain('Which project is it for?');
    expect(where).toContain('{text.trim()}');
  });

  it('lists recent folders, ending on the row that opens the folder window', () => {
    expect(where).toContain('Choose another folder');
    expect(where).toContain('onClick={() => pickPlace(places.length)}');
    expect(between('const pickPlace = useCallback', '}, [')).toContain('void chooseAnother()');
  });

  it('gives a new user the welcome screen’s button, not a lone row', () => {
    // The welcome's own: a centered ob-btn 40px under the heading, with its key.
    expect(where).toContain("<div className=\"ob-actions ob-in\" style={{ animationDelay: '0.2s', marginTop: 40 }}>");
    expect(where).toMatch(/className=\{`ob-btn[^>]*onClick=\{\(\) => void chooseAnother\(\)\}>/);
    expect(where).toContain('<>Choose its folder <Key k="↵" /></>');
    expect(where).not.toContain('ob-alone');
  });
});

describe('the schedule chip on the task screen', () => {
  const css = fs.readFileSync(new URL('../renderer/src/components/first-run.css', import.meta.url), 'utf8');

  it('drops its menu from the chip’s left edge, not from the time inside it', () => {
    expect(css).toContain('.first-run .ob-repeat { position: relative; }');
    expect(css).toContain('.first-run .ob-repeat .when-wrap { position: static; }');
    expect(css).toMatch(/\.first-run \.ob-repeat \.when-menu \{ left: -1px; top: calc\(100% \+ 6px\); \}/);
  });
});

describe('choosing a folder', () => {

  it('sends the task to the folder just chosen, with nothing more to press', () => {
    expect(between('const chooseFolder = useCallback', '}, [')).toContain('void sendTo(folder)');
  });
});
