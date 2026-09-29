// THE FOLDER CHOICE THAT MAKES macOS INTERROGATE YOU.
//
// The picker on the second screen of the setup opens on the home folder, so
// pressing Open without changing anything makes the home folder the project.
// Claude Code then starts there, lists it, and the system asks about Downloads,
// Music, Pictures and Application Support one panel at a time.
//
// These pin the refusal, and equally pin what is NOT refused, because a check
// that turns down `~/Documents/my-app` would be worse than no check at all.

import { describe, expect, it } from 'vitest';
import { GUARDED, checkProjectFolder, proposeParent } from '../shared/project-folder-check.mjs';

const HOME = '/Users/esther';

describe('the folders that are not a project', () => {
  it('turns down the home folder itself', () => {
    const r = checkProjectFolder(HOME, { home: HOME });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('home');
  });

  it('turns it down with a trailing slash too, which is what a picker returns', () => {
    expect(checkProjectFolder(`${HOME}/`, { home: HOME }).ok).toBe(false);
  });

  it('turns down the home folder written the way our own screens write it', () => {
    expect(checkProjectFolder('~', { home: HOME }).ok).toBe(false);
    expect(checkProjectFolder('~/', { home: HOME }).ok).toBe(false);
  });

  it('turns down every guarded folder in itself', () => {
    for (const name of GUARDED) {
      const r = checkProjectFolder(`${HOME}/${name}`, { home: HOME });
      expect(r.ok, name).toBe(false);
      expect(r.reason, name).toBe('guarded');
    }
  });

  it('names the folder that was picked, so the sentence is about her choice', () => {
    expect(checkProjectFolder(`${HOME}/Downloads`, { home: HOME }).say).toContain('Downloads');
  });

  it('says the words she used, so the panel she saw is the thing being answered', () => {
    const say = checkProjectFolder(HOME, { home: HOME }).say;
    expect(say).toContain('Downloads');
    expect(say).toContain('Music');
    expect(say).toContain('every app');
  });

  it('turns down the top of the disk and the system directories', () => {
    for (const p of ['/', '/Applications', '/Library', '/System', '/Users', '/usr', '/tmp']) {
      expect(checkProjectFolder(p, { home: HOME }).ok, p).toBe(false);
    }
  });

  it('turns down a whole external disk but not a project on one', () => {
    expect(checkProjectFolder('/Volumes/Work', { home: HOME }).ok).toBe(false);
    expect(checkProjectFolder('/Volumes/Work/my-app', { home: HOME }).ok).toBe(true);
  });
});

describe('what it must never turn down', () => {
  it('takes a project INSIDE a guarded folder, which is where plenty of code lives', () => {
    for (const name of GUARDED) {
      expect(checkProjectFolder(`${HOME}/${name}/my-app`, { home: HOME }).ok, name).toBe(true);
    }
  });

  it('takes an ordinary project folder', () => {
    expect(checkProjectFolder(`${HOME}/dev/kestrel`, { home: HOME }).ok).toBe(true);
    expect(checkProjectFolder(`${HOME}/code/agentbox`, { home: HOME }).ok).toBe(true);
  });

  it('takes a folder that only LOOKS like a guarded one', () => {
    expect(checkProjectFolder(`${HOME}/Documents-old`, { home: HOME }).ok).toBe(true);
    expect(checkProjectFolder(`${HOME}/work/Music`, { home: HOME }).ok).toBe(true);
  });

  it('takes nothing as an answer: an empty pick is a cancel, not a refusal', () => {
    expect(checkProjectFolder('', { home: HOME }).ok).toBe(true);
    expect(checkProjectFolder(null, { home: HOME }).ok).toBe(true);
  });

  it('does not refuse somebody else’s home when it does not know whose home it is', () => {
    // The renderer sometimes has no home to compare against. It must fail open:
    // main checks again before it writes anything.
    expect(checkProjectFolder('/Users/esther', { home: '' }).ok).toBe(true);
  });
});

describe('where a new project is proposed', () => {
  it('learns the parent from the projects they already have', () => {
    const parent = proposeParent(
      [`${HOME}/code/one`, `${HOME}/code/two`, `${HOME}/elsewhere/three`],
      { home: HOME },
    );
    expect(parent).toBe(`${HOME}/code`);
  });

  it('guesses a folder macOS does not guard when there is nothing to learn from', () => {
    // The old answer was ~/Desktop/dev, and Desktop is one of the guarded seven:
    // the first project anybody made asked the system for the Desktop.
    expect(proposeParent([], { home: HOME })).toBe(`${HOME}/dev`);
    expect(proposeParent([], { home: HOME })).not.toContain('Desktop');
  });

  it('never proposes a parent it would itself turn down', () => {
    const parent = proposeParent([`${HOME}/Downloads/thing`], { home: HOME });
    expect(checkProjectFolder(parent, { home: HOME }).ok).toBe(true);
    expect(parent).toBe(`${HOME}/dev`);
  });

  it('is stable when two parents tie', () => {
    const a = proposeParent([`${HOME}/aa/one`, `${HOME}/bbbb/two`], { home: HOME });
    const b = proposeParent([`${HOME}/bbbb/two`, `${HOME}/aa/one`], { home: HOME });
    expect(a).toBe(b);
  });
});
