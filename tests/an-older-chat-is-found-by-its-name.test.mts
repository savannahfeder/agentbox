// FINDING A CHAT YOU HAD IN JULY, BY TYPING ITS NAME.
//
// The import card offered the last ten days and nothing else, so a chat older
// than that could not be brought in at all (w-6418318cd5, from GitHub #31).
// The card now has a name field. These are the rules under it, which are the
// half that can be got wrong quietly: what matches, what must not, and what is
// ticked when the matches land.
//
// WHAT MUST NOT MATCH is the half worth pinning. The field says "by name", so
// typing a project's name may not drag in every chat that ran in it: that is
// how you press "Add 14 to your inbox" over a list you never read.
//
// NOTHING IS TICKED ON A MATCH. The ten-day list arrives ticked and that is the
// founder's own pick (w-db6f5e331e); a search is the opposite act. You typed
// four letters and got nine rows, and none of them is a row you chose.

import { describe, it, expect } from 'vitest';
import {
  LIST, SEARCH, matchesName, searchLines, reachLine, importLines, listLine,
} from '../renderer/src/agent-import-card';

const DAY = 86400e3;
// Noon UTC, so the day a date renders as is the same day either side of the
// Atlantic and this file does not fail on somebody else's clock.
const NOW = Date.UTC(2026, 9, 15, 12);
const thread = (id, daysAgo, title, source = 'terminal') => ({
  id, source, folder: '/w/zero', folderName: 'zero', short: '~/w/zero', title, when: NOW - daysAgo * DAY, path: `/t/${id}`,
});

const dests = [{
  key: 'project:zero',
  kind: 'project',
  name: 'Zero',
  slug: 'zero',
  folder: '/w/zero',
  where: '~/w/zero',
  items: [],
  threads: [
    thread('a', 2, 'Reopen the Powerup application'),
    thread('b', 40, 'The keychain popup keeps asking for access'),
    thread('c', 120, 'Open the most recent version as an electron app'),
  ],
}];

describe('what the name field matches', () => {
  it('finds a chat by a word in the middle of its name', () => {
    expect(matchesName('Reopen the Powerup application', 'powerup')).toBe(true);
  });

  it('does not care about capitals', () => {
    expect(matchesName('Reopen the Powerup application', 'POWERUP')).toBe(true);
    expect(matchesName('reopen the powerup application', 'Powerup')).toBe(true);
  });

  it('matches a run of letters inside a word, so half a name is enough', () => {
    expect(matchesName('The keychain popup keeps asking', 'keych')).toBe(true);
  });

  it('wants every word you typed, in any order', () => {
    expect(matchesName('Open the most recent version', 'recent open')).toBe(true);
    expect(matchesName('Open the most recent version', 'recent missing')).toBe(false);
  });

  it('matches nothing at all while the field is empty or blank', () => {
    expect(matchesName('Reopen the Powerup application', '')).toBe(false);
    expect(matchesName('Reopen the Powerup application', '   ')).toBe(false);
  });

  it('reads the name and never the folder it ran in', () => {
    // The chat above ran in ~/w/zero. Typing the project's name must not
    // return every chat that happened inside it.
    expect(matchesName('Reopen the Powerup application', 'zero')).toBe(false);
  });
});

describe('the lines a search puts on the card', () => {
  const lines = importLines(dests, NOW);

  it('keeps only the chats whose name matches, newest first', () => {
    const found = searchLines(lines, 'open');
    expect(found.map((l) => l.title)).toEqual([
      'Reopen the Powerup application',
      'Open the most recent version as an electron app',
    ]);
  });

  it('reaches past the last ten days: a chat from four months ago is in it', () => {
    const found = searchLines(lines, 'electron');
    expect(found).toHaveLength(1);
    expect(found[0].when).toBe(NOW - 120 * DAY);
  });

  it('still says where each one came from and when', () => {
    const [first] = searchLines(lines, 'powerup');
    expect(first.meta).toBe('Claude Code · Zero · Tuesday');
  });

  it('is empty when nothing matches, rather than falling back to everything', () => {
    expect(searchLines(lines, 'kangaroo')).toEqual([]);
  });

  it('is empty while the field is blank, because a blank field is not a search', () => {
    expect(searchLines(lines, '')).toEqual([]);
  });
});

describe('how far back the search really got', () => {
  it('says nothing while the whole window was read', () => {
    expect(reachLine(null, NOW)).toBe('');
    expect(reachLine(0, NOW)).toBe('');
  });

  it('names the day it stopped at, when there were too many to open', () => {
    expect(reachLine(NOW - 120 * DAY, NOW)).toBe('Searched back to Jun 17.');
  });

  it('has a word for the field and for the way back to the recent ten days', () => {
    expect(SEARCH.placeholder).toBe('Find a chat by name');
    expect(SEARCH.none('powerup')).toBe('No chat with “powerup” in its name.');
  });
});

describe('the line over the list once a search has added to it', () => {
  // Ticking a match puts that chat on the recent list, so the list is no
  // longer only the last ten days and the line over it may not say it is.
  const recent = [{ when: NOW - 2 * DAY }];

  it('says the ten days while the list really is the ten days', () => {
    expect(listLine(recent, NOW, false)).toBe(LIST.line);
  });

  it('owns up to the older ones once you have kept some', () => {
    const said = listLine(recent, NOW, true);
    expect(said).toBe(LIST.lineFound);
    expect(said).not.toBe(LIST.line);
    expect(said).toMatch(/found by name/i);
  });

  it('still says so when the ten days were empty and it reached back', () => {
    const old = [{ when: NOW - 40 * DAY }];
    expect(listLine(old, NOW, false)).toBe(LIST.lineOlder);
    expect(listLine(old, NOW, true)).toBe(LIST.lineFound);
  });
});
