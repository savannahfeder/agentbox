// NEW PROJECT OPENS THE MAC'S FOLDER WINDOW, AND NOTHING ELSE.
//
// WHAT BROKE. A tester made a project called "agentbox". The card filled in
// `~/dev/agentbox` by itself, pressing Make it CREATED that folder and a `~/dev`
// above it, and the agent that landed there reported an empty folder with no
// .git and could not work. Their actual clone was in `~/agentbox`. They found
// out from the agent's reply, which is the worst place to find anything out.
//
// HOW IT WAS MEASURED. The card is `renderer/src/components/NewProject.tsx`; it
// read `proposedFolder(name, parent)` and handed that path to `createProduct`,
// which runs `mkdirSync(repo, { recursive: true })`. Three rounds of drawings
// for a better picker were all rejected as confusing (2026-10-05), so the card
// is deleted rather than redrawn: New project opens the Mac's own folder
// window, the folder you pick IS the project, and the name comes off the folder.
//
// The cases, not the case: a folder picked becomes a project, a folder picked
// with a trailing slash still does, a cancelled window makes nothing, and no
// path is ever proposed from a name again.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectFromFolder } from '../renderer/src/project-folder';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const card = read('renderer', 'src', 'components', 'NewProject.tsx');
const app = read('renderer', 'src', 'App.tsx');

describe('the folder you picked becomes the project', () => {
  it('names the project after the folder, the way setup already does', () => {
    expect(projectFromFolder('/Users/you/agentbox')).toEqual({
      name: 'Agentbox', repoPath: '/Users/you/agentbox',
    });
    expect(projectFromFolder('/Users/you/Desktop/dev/agentbox-team').name).toBe('Agentbox Team');
    expect(projectFromFolder('/Users/you/code/north_sound').name).toBe('North Sound');
  });

  it('is not thrown by a trailing slash, which a chooser can hand back', () => {
    expect(projectFromFolder('/Users/you/agentbox/')).toEqual({
      name: 'Agentbox', repoPath: '/Users/you/agentbox',
    });
  });

  it('answers nothing for nothing, so a cancel can never make a project', () => {
    expect(projectFromFolder('')).toBe(null);
    expect(projectFromFolder('   ')).toBe(null);
    expect(projectFromFolder(null)).toBe(null);
  });
});

describe('the card is gone', () => {
  it('asks the Mac for a folder as soon as it opens, with nothing to fill in first', () => {
    expect(card).toContain('api.chooseFolder');
    // No name field, no path field: there is nothing on the screen at all.
    expect(card.match(/<input/g)).toBe(null);
  });

  it('proposes no folder from a name, which is the fault itself', () => {
    expect(card).not.toContain('proposedFolder');
    expect(card).not.toContain('a new folder');
    expect(app).not.toContain('proposeParent');
  });

  it('treats a cancelled window as no answer: nothing made, card closed', () => {
    expect(card).toContain('if (!picked) { onClose(); return; }');
  });

  it('still opens the app\'s own picker in a browser tab, where there is no Mac window', () => {
    const atBrowse = card.indexOf('if (browse)');
    const atRefusal = card.indexOf('if (why)');
    expect(atBrowse).toBeGreaterThan(-1);
    expect(atRefusal).toBeGreaterThan(atBrowse);
    expect(card).toContain('FolderPicker');
  });
});

describe('every door into it goes the same way', () => {
  // The composer's project menu got its own New project row on 2026-10-05
  // (ThreadComposer.tsx). It must not be a second route with a second
  // behaviour: every door sets the same flag and so runs this same flow.
  it('is one flag, set by the thread composer, the palette, Settings and the agent import', () => {
    expect(app.match(/setNewProject\(true\)/g)?.length).toBeGreaterThanOrEqual(4);
    for (const door of [
      ['the thread composer', 'renderer/src/threads/ThreadComposer.tsx'],
      ['the composer', 'renderer/src/components/Compose.tsx'],
      ['the projects page', 'renderer/src/components/ProjectsPage.tsx'],
    ]) {
      expect(read(door[1])).toContain('New project');
    }
  });
});
