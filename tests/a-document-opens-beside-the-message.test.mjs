// A document opens beside the message, and a markdown file can be typed into.
//
// What this pins is the part that has no picture: which files the pane will
// open at all, what it calls them, how far the divider may travel, and the two
// rules that make typing straight onto a file on disk safe to leave switched on.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  docKind, opensInPane, crumbParts, docName,
  clampSplit, splitFromPointer, readSplit, writeSplit,
  MIN_SPLIT, MAX_SPLIT, EVEN_SPLIT, OPENING_SPLIT, SPLIT_KEY,
} from '../renderer/src/doc-pane.ts';
import { canWrite, writeDoc, readDoc, isInside, MAX_DOC_BYTES } from '../main/doc-file.mjs';
import { NAME, Name } from '../shared/product-name.mjs';

describe('what the pane opens', () => {
  it('opens the two she named, and starts with html', () => {
    expect(docKind('designs/w-74b0b5cd87/pane-card/the-card-you-picked.html')).toBe('html');
    expect(docKind('landing/dev.htm')).toBe('html');
    expect(docKind('STATE.md')).toBe('markdown');
    expect(docKind('notes.markdown')).toBe('markdown');
  });

  // 2026-09-20.This line used to say a png went to Preview, which was her own
  // rule from 08-20 and is the one she reversed here. Preview is still the open
  // mark in the pane's own header.
  it('opens a picture too, since she asked for a viewer in the app', () => {
    for (const p of ['attachments/pasted-77668.png', 'designs/shot.PNG', 'a.jpg', 'a.jpeg', 'a.gif', 'a.webp', 'a.svg']) {
      expect(docKind(p), p).toBe('image');
      expect(opensInPane(p), p).toBe(true);
    }
  });

  it('leaves everything else to the app that owns it', () => {
    // A pdf inside a sandboxed frame draws nothing at all in Chromium, and a
    // source file belongs in her editor.
    for (const p of ['reports/audit.pdf', 'main/ipc.mjs', 'data.csv']) {
      expect(docKind(p), p).toBeNull();
      expect(opensInPane(p), p).toBe(false);
    }
    expect(docKind(null)).toBeNull();
    expect(docKind(undefined)).toBeNull();
  });

  it('reads the extension through a query string or a fragment', () => {
    expect(docKind('designs/round19.html?v=2')).toBe('html');
    expect(docKind('designs/round19.html#s16')).toBe('html');
    expect(docKind('attachments/shot.png?v=2')).toBe('image');
  });
});

describe('the breadcrumb says which file, not where the disk keeps it', () => {
  const roots = [
    '/Users/you/Zero/accounts/00000000/agentbox',
    '/Users/you/Zero/accounts/00000000/astral/designs',
    '/Users/you/Zero/accounts/00000000/agentbox/attachments',
    '/Users/you/Desktop/dev/zero',
  ];

  it('starts at the product folder and drops the account plumbing above it', () => {
    expect(crumbParts('/Users/you/Zero/accounts/00000000/agentbox/STATE.md', roots))
      .toEqual(['agentbox', 'STATE.md']);
  });

  it('lets the deepest root win, so designs/ does not swallow the drawing folder', () => {
    // Both `agentbox` and `astral/designs` contain this file. If the shallower
    // one wins the crumb reads agentbox › designs › w-88d…, which is true; if the
    // deeper one wins it reads designs › w-88d…, which is what the folder is
    // called. The rule is the deeper one, so the leading word is the nearest
    // named place rather than always the product.
    expect(crumbParts('/Users/you/Zero/accounts/00000000/astral/designs/w-74b0b5cd87/pane-card/the-card-you-picked.html', roots))
      .toEqual(['designs', 'w-74b0b5cd87', 'pane-card', 'the-card-you-picked.html']);
  });

  it('keeps the last three segments when nothing matches, never the whole disk', () => {
    expect(crumbParts('/some/where/else/entirely/deep/report.html', []))
      .toEqual(['entirely', 'deep', 'report.html']);
  });

  it('takes a file:// url and a bare relative path too', () => {
    expect(crumbParts('file:///Users/you/Zero/accounts/00000000/agentbox/STATE.md', roots))
      .toEqual(['agentbox', 'STATE.md']);
    expect(docName('designs/dev-landing-shots/round19.html')).toBe('round19.html');
  });
});

describe('fully resizable, hers, and the two floors on it', () => {
  it('opens on an even split', () => {
    expect(EVEN_SPLIT).toBe(0.5);
  });

  it('never lets either half become a sliver', () => {
    expect(clampSplit(0.02)).toBe(MIN_SPLIT);
    expect(clampSplit(0.99)).toBe(MAX_SPLIT);
    expect(clampSplit(0.42)).toBe(0.42);
    expect(clampSplit(Number.NaN)).toBe(EVEN_SPLIT);
  });

  it('measures the drag from the right edge, because that half is the document', () => {
    expect(splitFromPointer(960, 1920)).toBe(0.5);
    expect(splitFromPointer(1440, 1920)).toBe(0.25);
    // Past the floor it stops rather than following the pointer off the screen.
    expect(splitFromPointer(1900, 1920)).toBe(MIN_SPLIT);
  });

  it('remembers where she put it, and survives a store that refuses', () => {
    const store = new Map();
    const fake = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    writeSplit(fake, 0.62);
    expect(store.get(SPLIT_KEY)).toBe('0.62');
    expect(readSplit(fake)).toBe(0.62);
    // A value written by an older build, or by hand, is still clamped on the
    // way back in.
    store.set(SPLIT_KEY, '4');
    expect(readSplit(fake)).toBe(MAX_SPLIT);
    // NO READABLE PREFERENCE FALLS BACK TO WHERE THE PANE OPENS, which is three
    // quarters since that was picked and was an even split before it.
    // Only a store she has really written to outranks it.
    const broken = { getItem: () => { throw new Error('private mode'); }, setItem: () => { throw new Error('private mode'); } };
    expect(readSplit(broken)).toBe(OPENING_SPLIT);
    expect(() => writeSplit(broken, 0.5)).not.toThrow();
    expect(readSplit(null)).toBe(OPENING_SPLIT);
  });
});

/* ------------------ typing straight onto a file on disk ------------------- */
// Two rules make this safe enough to leave on: only markdown is writable, and a
// write stays inside the product's own folders. Both are measured here rather
// than reviewed, because the failure mode is silent and it is her files.
function fakeFs(files) {
  const now = { ...files };
  return {
    existsSync: (p) => Object.prototype.hasOwnProperty.call(now, p),
    statSync: (p) => {
      if (!(p in now)) throw new Error('ENOENT');
      return { size: Buffer.byteLength(now[p].text ?? ''), mtimeMs: now[p].mtime ?? 0 };
    },
    readFileSync: (p) => now[p].text,
    writeFileSync: (p, text) => { now[p] = { text, mtime: (now[p]?.mtime ?? 0) + 5000 }; },
    _files: now,
  };
}
const AGENTBOX = { slug: 'agentbox', name: Name, dir: '/acct/agentbox', repoPath: '/dev/zero' };

describe('her edit goes onto the file, and only where it may', () => {
  it('writes a markdown file inside the product', () => {
    const fs = fakeFs({ '/acct/agentbox/notes.md': { text: 'before', mtime: 1000 } });
    const res = writeDoc({ file: '/acct/agentbox/notes.md', product: AGENTBOX, text: '# after', mtime: 1000, fs });
    expect(res.ok).toBe(true);
    expect(fs._files['/acct/agentbox/notes.md'].text).toBe('# after');
  });

  it('refuses an html page, because a page is a program', () => {
    const fs = fakeFs({ '/acct/astral/designs/round19.html': { text: '<html>', mtime: 1 } });
    const res = writeDoc({ file: '/acct/astral/designs/round19.html', product: AGENTBOX, text: 'x', fs });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/markdown/i);
    expect(fs._files['/acct/astral/designs/round19.html'].text).toBe('<html>');
  });

  it('refuses a file outside the product, however it was reached', () => {
    // Reading honours an absolute path a worker typed, which is how a link into
    // the app's own repo works. Writing does not: a card is one product's, and
    // this pane must never be the way another product's file gets edited.
    const fs = fakeFs({ '/acct/meadow/plan.md': { text: 'theirs', mtime: 1 } });
    const res = writeDoc({ file: '/acct/meadow/plan.md', product: AGENTBOX, text: 'mine', fs });
    expect(res.ok).toBe(false);
    expect(res.error).toContain(Name);
    expect(fs._files['/acct/meadow/plan.md'].text).toBe('theirs');
  });

  it('does not let a neighbouring folder pass as the product', () => {
    // /acct/agentbox-old is not inside /acct/agentbox, and a plain prefix test says
    // it is.
    expect(isInside('/acct/agentbox', '/acct/agentbox-old/notes.md')).toBe(false);
    expect(isInside('/acct/agentbox', '/acct/agentbox/deep/notes.md')).toBe(true);
  });

  it('refuses to overwrite a file something else changed while she typed', () => {
    // An agent rewriting the same document mid-edit is the one case where a
    // save would eat somebody's work without either side noticing.
    const fs = fakeFs({ '/acct/agentbox/STATE.md': { text: 'agent wrote this', mtime: 9000 } });
    const res = writeDoc({ file: '/acct/agentbox/STATE.md', product: AGENTBOX, text: 'hers', mtime: 1000, fs });
    expect(res.ok).toBe(false);
    expect(res.stale).toBe(true);
    expect(fs._files['/acct/agentbox/STATE.md'].text).toBe('agent wrote this');
  });

  it('hands back the new mtime so the next save is not refused as stale', () => {
    const fs = fakeFs({ '/acct/agentbox/notes.md': { text: 'a', mtime: 1000 } });
    const first = writeDoc({ file: '/acct/agentbox/notes.md', product: AGENTBOX, text: 'b', mtime: 1000, fs });
    expect(first.ok).toBe(true);
    const second = writeDoc({ file: '/acct/agentbox/notes.md', product: AGENTBOX, text: 'c', mtime: first.mtime, fs });
    expect(second.ok).toBe(true);
    expect(fs._files['/acct/agentbox/notes.md'].text).toBe('c');
  });

  it('says so when the file has gone rather than creating it again', () => {
    const fs = fakeFs({});
    const res = canWrite({ file: '/acct/agentbox/gone.md', product: AGENTBOX, fs });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no longer there/);
  });
});

describe('reading a document', () => {
  it('hands back the text and when it was last written', () => {
    const fs = fakeFs({ '/acct/agentbox/STATE.md': { text: `# ${NAME}`, mtime: 4242 } });
    expect(readDoc({ file: '/acct/agentbox/STATE.md', fs })).toEqual({
      ok: true, path: '/acct/agentbox/STATE.md', text: `# ${NAME}`, mtime: 4242,
    });
  });

  it('will not try to load something enormous into an editor', () => {
    const fs = {
      statSync: () => ({ size: MAX_DOC_BYTES + 1, mtimeMs: 0 }),
      existsSync: () => true,
      readFileSync: () => { throw new Error('should never be read'); },
    };
    const res = readDoc({ file: '/acct/agentbox/huge.md', fs });
    expect(res.ok).toBe(false);
    expect(res.tooBig).toBe(true);
  });

  it('opens nothing it cannot draw', () => {
    expect(readDoc({ file: '/acct/agentbox/photo.png' }).ok).toBe(false);
  });
});

describe('the pane and the app finder agree on where to look', () => {
  it('uses the same roots the main process guesses against', async () => {
    // The breadcrumb's roots and the finder's roots are the same folders.
    // If they drift, a file opens and the crumb calls it something else.
    //
    // THE SIXTH IS THE APP'S OWN HOME, where
    // `runs/<item>/the-change-it-made.change` now lives. It is last, so nothing
    // of hers is ever shadowed by one of ours.
    const { artifactRoots } = await import('../main/artifact-path.mjs');
    const { machineryDir } = await import('../main/store/home.mjs');
    expect(artifactRoots(AGENTBOX)).toEqual([
      '/acct/agentbox',
      path.join('/acct/agentbox', 'designs'),
      path.join('/acct/agentbox', 'attachments'),
      '/dev/zero',
      path.join('/dev/zero', 'designs'),
      machineryDir('/acct/agentbox'),
    ]);
  });
});
