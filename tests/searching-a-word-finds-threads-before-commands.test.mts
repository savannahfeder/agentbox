// Searching "Onboarding" and pressing Enter threw someone into first-run setup:
// the Set up again row answers to the keyword "onboarding", commands are listed
// above threads, so it sat under the return key, and Escape did not leave the
// welcome screen; only a reload did. A word that only touches a command's hidden
// keywords now comes after the threads it found, and setup must be asked for by
// the words on its row.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { paletteOrder, threadRows } from '../renderer/src/components/Palette';

const cmd = (id, label, keywords = '') => ({ id, label, keywords, run: () => {} });
const thread = (id, label) => ({ id: `thread-${id}`, label, run: () => {} });
const setup = cmd('first-run', 'Set Agentbox up again', 'onboarding first run new user welcome intro setup');
const walk = cmd('tutorial', 'Take the tutorial', 'tutorial practice walkthrough');
const rename = cmd('rename', 'Rename thread', 'name title');

describe('what is under the return key', () => {
  it('the reported case: a thread, not setup', () => {
    const { rows } = paletteOrder([setup], [thread('1', 'Onboarding direction A')], false, 'onboarding');
    expect(rows[0].id).toBe('thread-1');
  });
  it('a command matched only by a keyword follows threads', () => {
    const { rows } = paletteOrder([rename], [thread('1', 'A title for it')], false, 'title');
    expect(rows.map((r) => r.id)).toEqual(['thread-1', 'rename']);
  });
  it('a command named by what was typed stays first', () => {
    const { rows } = paletteOrder([rename], [thread('1', 'Rename the button')], false, 'rename');
    expect(rows.map((r) => r.id)).toEqual(['rename', 'thread-1']);
  });
  it('labels sit over each list in its new place', () => {
    const { labels } = paletteOrder([rename], [thread('1', 'A title')], false, 'title');
    expect(labels.get(0)).toBe('Threads');
    expect(labels.get(1)).toBe('Commands');
  });
  it('with no threads found the command is still there', () => {
    const { rows } = paletteOrder([rename], [], false, 'title');
    expect(rows.map((r) => r.id)).toEqual(['rename']);
  });
  it('nothing typed is the list it always was', () => {
    const { rows, labels } = paletteOrder([rename, walk], [], false, '');
    expect(rows.map((r) => r.id)).toEqual(['rename', 'tutorial']);
    expect(labels.size).toBe(0);
  });
  it('a phone still lists threads first', () => {
    const { rows } = paletteOrder([rename], [thread('1', 'Rename it')], true, 'rename');
    expect(rows[0].id).toBe('thread-1');
  });
});

describe('setup is asked for by name', () => {
  it('a keyword alone does not offer it', () => {
    expect(paletteOrder([setup], [], false, 'onboarding').rows).toEqual([]);
    expect(paletteOrder([setup], [], false, 'intro').rows).toEqual([]);
  });
  it('the words it is called do', () => {
    expect(paletteOrder([setup], [], false, 'set agentbox').rows.map((r) => r.id)).toEqual(['first-run']);
    expect(paletteOrder([setup], [], false, 'again').rows.map((r) => r.id)).toEqual(['first-run']);
  });
});

describe('the rows threads are found from', () => {
  it('stay as they were', () => {
    expect(threadRows('x', () => [thread('1', 'x')]).map((r) => r.id)).toEqual(['thread-1']);
  });
});

describe('Escape leaves setup started again', () => {
  it('the app listens for it', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('leaveSetupAgain');
  });
});
