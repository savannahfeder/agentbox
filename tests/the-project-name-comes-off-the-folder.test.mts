// A PROJECT'S NAME, TAKEN FROM ITS FOLDER. `nameFromFolder` writes the name a
// new project opens with, her "name second, and prefilled" from 08-20, and until
// this file it had no test of its own.
//
// It is pure and it is about somebody ELSE'S folders. Her own are
// `~/Desktop/dev/<lowercase-hyphens>` almost without exception, so the cases
// that matter here are the ones her machine cannot produce: a folder with a dot
// in it, a folder already capitalised, an acronym, a name that is only a
// number, a path under a home directory that is not hers.

import { describe, expect, it } from 'vitest';
import { nameFromFolder } from '../renderer/src/onboarding.ts';

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

});
