// A DECK OR A FILM OPENS IN THE APP.
//
// A click on october-investor-deck.pdf did nothing for three people: the link
// went to the operating system (`docKind` answered null), which on a copy with
// no Preview to hand is no viewer, no panel, no error. Same for the name above
// a film. Measured with whereALinkGoes: 'outside' for both.
import { it, expect, describe } from 'vitest';
import { crumbParts, docKind } from '../renderer/src/doc-pane';
import { glanceFile } from '../renderer/src/file-glance';
import { linkArtifactPaths } from '../renderer/src/artifact-paths';
import { whereALinkGoes } from '../renderer/src/link-click';
import { servable } from '../main/img-scheme.mts';
import { filesNamedInWords, isCarriedKind } from '../shared/carried-files.mts';

describe('where a click goes', () => {
  it('opens a pdf and a film in the pane', () => {
    expect(docKind('attachments/k-deck.pdf')).toBe('pdf');
    expect(docKind('x/CUT.MP4')).toBe('film');
    expect(docKind('x/cut.webm')).toBe('film');
    expect(whereALinkGoes('deck.pdf')).toBe('pane');
    expect(whereALinkGoes('cut.mov')).toBe('pane');
  });
  it('still sends a press with the new-tab key outside', () => {
    expect(whereALinkGoes('deck.pdf', { metaKey: true })).toBe('outside');
  });
  it('leaves what the pane cannot draw outside', () => {
    expect(docKind('sheet.xlsx')).toBeNull();
    expect(docKind('voice.mp3')).toBeNull();
    expect(whereALinkGoes('sheet.xlsx')).toBe('outside');
  });
});

describe('what the pane says', () => {
  it('names a carried file by its own path, not by where it was shelved', () => {
    expect(crumbParts('/a/direct-1/attachments/carried/0123456789abcdef/reports/plan.md', ['/a/direct-1'])).toEqual(['reports', 'plan.md']);
    expect(crumbParts('/a/direct-1/attachments/k-plan.md', ['/a/direct-1'])).toEqual(['direct-1', 'attachments', 'k-plan.md']);
  });
  it('reads a tile as on its way, and no tile for a file that will not come', async () => {
    const reader = (r) => ({ readDoc: async () => r, resolveDoc: async () => r, codeChange: async () => r });
    expect((await glanceFile(reader({ ok: false, coming: true, error: 'on its way' }), 'p', 'a.md')).coming).toBe(true);
    expect((await glanceFile(reader({ ok: false, coming: true }), 'p', 'a.pdf')).coming).toBe(true);
    expect(await glanceFile(reader({ ok: false, error: 'no' }), 'p', 'a.md')).toBeNull();
  });
});

describe('a whole path in a message', () => {
  const linked = (options) => {
    const tree = { type: 'root', children: [{ type: 'text', value: 'see /Users/jordan/x/plan.md now' }] };
    linkArtifactPaths(tree, options);
    return tree.children.some((n) => n.type === 'link' && n.url === '/Users/jordan/x/plan.md');
  };
  it('is a link in a conversation, where it may be a teammate\'s', () => {
    expect(linked({ dir: '/here/direct-1', anyFull: true })).toBe(true);
  });
  it('stays words anywhere else', () => {
    expect(linked({ dir: '/here/project' })).toBe(false);
  });
});

describe('what the window may load', () => {
  it('serves a pdf inside a root the app owns, and not outside it', () => {
    expect(servable('/root/a/deck.pdf', ['/root'], 'darwin')).toBe(true);
    expect(servable('/other/deck.pdf', ['/root'], 'darwin')).toBe(false);
    expect(servable('/root/a/notes.txt', ['/root'], 'darwin')).toBe(false);
  });
});

describe('which words name a file', () => {
  it('reads a link, a code span, a bare path, a bare name and a whole path', () => {
    expect(filesNamedInWords('[plan](reports/plan.md) `a/b.pdf` c/d.png e.mov /Users/x/f.html')).toEqual(
      ['reports/plan.md', 'a/b.pdf', 'c/d.png', 'e.mov', '/Users/x/f.html'],
    );
  });
  it('reads a name with a space when it is quoted', () => {
    expect(filesNamedInWords('open "Q3 plan.md" please')).toEqual(['Q3 plan.md']);
  });
  it('leaves a web address, a version number and other kinds alone', () => {
    expect(filesNamedInWords('https://x.test/a.png v1.2 e.g. run.sh app.json')).toEqual([]);
  });
  it('names each once', () => {
    expect(filesNamedInWords('a.md and a.md and ./a.md')).toEqual(['a.md']);
  });
  it('knows the kinds that open', () => {
    for (const n of ['a.png', 'a.JPG', 'a.mp4', 'a.md', 'a.html', 'a.pdf']) expect(isCarriedKind(n)).toBe(true);
    for (const n of ['a.sh', 'a.env', 'a', 'a.json', 'a.key']) expect(isCarriedKind(n)).toBe(false);
  });
});
