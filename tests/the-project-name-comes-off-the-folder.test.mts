// THE NAME ON THE THIRD SCREEN, AND THE PATH ON THE SECOND.
//
// Two functions stand between a stranger's Mac and the two screens after the
// welcome, and until this file neither had a test of its own. `nameFromFolder`
// writes the name the third screen opens with, which is her "name second, and
// prefilled" from 08-20; `shortPath` is what the second screen shows back after
// the folder is chosen, and it is the one place in the walk that has to know
// whose Mac it is running on.
//
// Both are pure and both are about somebody ELSE'S folders. Her own are
// `~/Desktop/dev/<lowercase-hyphens>` almost without exception, so the cases
// that matter here are the ones her machine cannot produce: a folder with a dot
// in it, a folder already capitalised, an acronym, a name that is only a
// number, a path under a home directory that is not hers.

import { describe, expect, it } from 'vitest';
import { START, advance, nameFromFolder, shortPath } from '../renderer/src/onboarding.ts';

describe('the name the third screen opens with', () => {
  it('reads a path as a name, which is what she asked for', () => {
    // `~/Desktop/dev/agentbox-v2` reads as `Agentbox v2`. It capitalises each word,
    // so what it really gives is `Agentbox V2`, and that is what has been on the
    // screen since the walk was built.
    expect(nameFromFolder('/Users/leon/Desktop/dev/agentbox-v2')).toBe('Agentbox V2');
  });

  it('takes hyphens, underscores and dots apart the same way', () => {
    expect(nameFromFolder('/Users/leon/dev/side-quest')).toBe('Side Quest');
    expect(nameFromFolder('/Users/leon/dev/side_quest')).toBe('Side Quest');
    expect(nameFromFolder('/Users/leon/dev/side.quest')).toBe('Side Quest');
    expect(nameFromFolder('/Users/leon/dev/side-quest_two.three')).toBe('Side Quest Two Three');
  });

  it('never shouts a name that was already written properly', () => {
    // Somebody whose folders are `~/Developer/My Project` gets their own words
    // back, not a version of them with the capitals moved.
    expect(nameFromFolder('/Users/leon/Developer/My Project')).toBe('My Project');
    expect(nameFromFolder('/Users/leon/dev/Kestrel')).toBe('Kestrel');
    // An acronym stays an acronym: only the first letter is ever touched.
    expect(nameFromFolder('/Users/leon/dev/foo-BAR-baz')).toBe('Foo BAR Baz');
    expect(nameFromFolder('/Users/leon/dev/iOS-app')).toBe('IOS App');
  });

  it('ignores a trailing slash, which is what a folder picker hands back', () => {
    expect(nameFromFolder('/Users/leon/dev/kestrel/')).toBe('Kestrel');
    expect(nameFromFolder('/Users/leon/dev/kestrel///')).toBe('Kestrel');
  });

  it('leaves a name that is only a number alone', () => {
    expect(nameFromFolder('/Users/leon/dev/2048')).toBe('2048');
  });

  it('never comes back with punctuation or a double space in it', () => {
    // A blank name and a name reading `--weird--` are both a bad first
    // impression on a screen that says "and this is what it is called".
    expect(nameFromFolder('/Users/leon/dev/--weird--')).toBe('Weird');
    expect(nameFromFolder('/Users/leon/dev/.config')).toBe('Config');
    expect(nameFromFolder('/Users/leon/dev/my  app')).toBe('My App');
  });

  it('says nothing rather than something wrong when there is no folder to read', () => {
    // The picker cancelled, or a path that is only the root. Empty is right
    // here: the name box is then simply blank and waiting, and the walk cannot
    // submit an empty one.
    expect(nameFromFolder('/')).toBe('');
    expect(nameFromFolder('')).toBe('');
  });

  it('is what the walk really carries forward, not a separate guess', () => {
    const run = advance({ ...START, step: 'folder' }, { t: 'folder', path: '/Users/leon/dev/side-quest' });
    expect(run.name).toBe(nameFromFolder('/Users/leon/dev/side-quest'));
    expect(run.name).toBe('Side Quest');
  });
});

describe('the folder shown back on the second screen', () => {
  it('says ~ on whoever s Mac this is, not on hers', () => {
    expect(shortPath('/Users/leon/Developer/side-quest', '/Users/leon'))
      .toBe('~/Developer/side-quest');
    expect(shortPath('/Users/you/Desktop/dev/zero', '/Users/you'))
      .toBe('~/Desktop/dev/zero');
  });

  it('does not care whether the home it was handed ends in a slash', () => {
    expect(shortPath('/Users/leon/dev/x', '/Users/leon/')).toBe('~/dev/x');
    expect(shortPath('/Users/leon/dev/x', '/Users/leon///')).toBe('~/dev/x');
  });

  it('never shortens on a name that merely starts the same way', () => {
    // `/Users/leon` against `/Users/leonard/...` is the one way a home-directory
    // prefix goes wrong, and it goes wrong silently: the path would come back
    // reading `~ard/dev/x`.
    expect(shortPath('/Users/leonard/dev/x', '/Users/leon')).toBe('/Users/leonard/dev/x');
    expect(shortPath('/Users/leon2/dev/x', '/Users/leon')).toBe('/Users/leon2/dev/x');
  });

  it('shows a path outside the home directory whole, because that is what it is', () => {
    expect(shortPath('/opt/src/thing', '/Users/leon')).toBe('/opt/src/thing');
    expect(shortPath('/Volumes/Work/thing', '/Users/leon')).toBe('/Volumes/Work/thing');
  });

  it('shows the path itself when nobody told it whose Mac this is', () => {
    // The walk reads the home over IPC. A renderer that has not been answered
    // yet must show the real path rather than guess at a home to cut off.
    expect(shortPath('/Users/leon/dev/x')).toBe('/Users/leon/dev/x');
    expect(shortPath('/Users/leon/dev/x', '')).toBe('/Users/leon/dev/x');
  });
});
