// Every file a message refers to ends up at the foot of it.
//
// So the message text is the manifest, and these pin what counts as a reference
// and what does not: a wrong chip sends her to a file the worker never wrote
// about, which is worse than no chip at all.
import { describe, it, expect } from 'vitest';
import { referencedFiles, fileLabel } from '../renderer/src/referenced-files';

describe('the three ways a worker names a file', () => {
  it('takes a markdown link and an image', () => {
    expect(referencedFiles('See [the report](reports/week-32.md) and ![shot](designs/hero.png).'))
      .toEqual(['reports/week-32.md', 'designs/hero.png']);
  });

  it('takes a path in a code span', () => {
    expect(referencedFiles('I rewrote `renderer/src/list-rules.ts` this morning.'))
      .toEqual(['renderer/src/list-rules.ts']);
  });

  it('takes a bare path in prose', () => {
    expect(referencedFiles('The demo is at designs/round-3.html if you want to click it.'))
      .toEqual(['designs/round-3.html']);
  });
});

describe('what is not an attachment', () => {
  it('leaves urls, absolute paths and anchors alone', () => {
    expect(referencedFiles('https://example.com/a.png and /etc/hosts.md and [x](#section)'))
      .toEqual([]);
  });

  it('does not turn ordinary prose with dots into files', () => {
    expect(referencedFiles('Shipped v1.2 today, e.g. the rank work. No files here.')).toEqual([]);
  });

  it('does not attach a link that points at something other than a file', () => {
    expect(referencedFiles('[the item](zero://item/abc123) and [a query](?view=done)')).toEqual([]);
  });
});

describe('one file, one chip', () => {
  it('says a file once however many times it is named', () => {
    const body = 'Start with `notes.md`, then read [notes](notes.md), and notes.md again.';
    expect(referencedFiles(body)).toEqual(['notes.md']);
  });

  it('gathers across every part of a message, in reading order', () => {
    const body = 'I looked at icp.md.';
    const result = 'Wrote [the plan](plans/august.md), see also designs/hero.png.';
    expect(referencedFiles(body, result)).toEqual(['icp.md', 'plans/august.md', 'designs/hero.png']);
  });

  it('ignores the empty parts of a message', () => {
    expect(referencedFiles(undefined, null, '', 'a.md')).toEqual(['a.md']);
  });
});

describe('what a chip says', () => {
  it('leads with the file name and keeps the folder quiet', () => {
    expect(fileLabel('reports/2026/week-32.md')).toEqual({ name: 'week-32.md', where: 'reports/2026' });
    expect(fileLabel('notes.md')).toEqual({ name: 'notes.md', where: '' });
  });
});

// A PATH WRITTEN OUT IN FULL IS STILL ONE OF OURS, when it lands in her folder.
//
// The chips, the embedded page, the document the card opens on its own and the
// brief a worker is spawned with all read this one function, so all four were
// silent at once. Inside her folder it becomes the short path everything
// downstream already understands.
const DIR = '/Users/you/Zero/accounts/00000000-0000-4000-8000-000000000000/agentbox';

describe('a path written out in full', () => {
  it('is read as ours when it lands inside the product folder', () => {
    const body = `The page is at ${DIR}/designs/w-d4eeb20f8c/the-first-row.html`;
    expect(referencedFiles(body, { dir: DIR })).toEqual(['designs/w-d4eeb20f8c/the-first-row.html']);
  });

  it('is the same file whether it was written long or short', () => {
    const body = `See ${DIR}/reports/week-32.md and reports/week-32.md again.`;
    expect(referencedFiles(body, { dir: DIR })).toEqual(['reports/week-32.md']);
  });

  it('works inside a markdown link as well as in prose', () => {
    const body = `[the page](${DIR}/designs/hero.png)`;
    expect(referencedFiles(body, { dir: DIR })).toEqual(['designs/hero.png']);
  });

  it('leaves our own machinery alone: scratch files and source trees', () => {
    const body = 'I wrote /tmp/zero-restart.sh and edited /Users/you/Desktop/dev/zero/main/ipc.mjs.';
    expect(referencedFiles(body, { dir: DIR })).toEqual([]);
  });

  it('still leaves urls and other absolute paths alone', () => {
    const body = 'https://example.com/a.png and /etc/hosts.md and [x](#section)';
    expect(referencedFiles(body, { dir: DIR })).toEqual([]);
  });

  it('does nothing at all when no folder is given', () => {
    const body = `The page is at ${DIR}/designs/w-d4eeb20f8c/the-first-row.html`;
    expect(referencedFiles(body)).toEqual([]);
  });

  it('does not mistake a folder whose name merely starts the same way', () => {
    const body = `${DIR}-old/designs/hero.png`;
    expect(referencedFiles(body, { dir: DIR })).toEqual([]);
  });

  it('reads a trailing slash on the folder the same as none', () => {
    const body = `${DIR}/designs/hero.png`;
    expect(referencedFiles(body, { dir: `${DIR}/` })).toEqual(['designs/hero.png']);
  });
});
