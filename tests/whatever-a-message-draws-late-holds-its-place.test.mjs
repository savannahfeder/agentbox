// WHATEVER A MESSAGE DRAWS LATE HOLDS ITS PLACE (2026-10-16).
//
// "This isn't just for pictures. It's for all sorts of components that might be
// in the chat that have to render." Read off renderer/src/components on
// 2026-10-16, the first frame of each piece that waits on the computer before
// it can draw, and what it became:
//   a page named in a message   nothing        -> a 33px bar and a 480px frame
//   a file tile under a message nothing        -> a 128px tile, and it blinked
//                                                 out again on every refresh
//   a folder of pictures        one line       -> a row or two of pictures
//   a picture still looked for  nothing        -> a picture
//   a film                      300 x 150      -> its own size, up to 360 high
//   a chart                     120px, flat    -> its drawing
// renderToStaticMarkup draws exactly that first frame, before any answer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtifactEmbed, ArtifactImg, FolderPreview } from '../renderer/src/components/Focus.tsx';
import { MessageFiles } from '../renderer/src/components/MessageFiles.tsx';

const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tiles = fs.readFileSync(new URL('../renderer/src/components/message-files.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const draw = (c, props) => renderToStaticMarkup(createElement(c, props));
const rule = (text, sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...text.matchAll(new RegExp(`([^{}]*${esc}(?![-\\w])[^{}]*)\\{([^{}]*)\\}`, 'g'))].map((m) => m[2]).join(';');
};

describe('the shimmer every waiting piece wears', () => {
  it('is one class, in the theme\'s own colours', () => {
    const arriving = rule(css, '.arriving');
    expect(arriving).toMatch(/animation:\s*phone-shimmer/);
    expect(arriving).toMatch(/var\(--bg-raised\)/);
    expect(arriving).toMatch(/var\(--wash\)/);
  });
});

describe('a page named in a message, while it is being found', () => {
  const first = draw(ArtifactEmbed, { product: 'p', path: 'designs/w-1/pricing.html' });

  it('draws its frame and name rather than nothing', () => {
    expect(first).toContain('class="artifact-embed');
    expect(first).toContain('designs/w-1/pricing.html');
    expect(first).toMatch(/class="[^"]*arriving/);
  });

  it('holds the height the page will have', () => {
    expect(rule(css, '.artifact-embed-arriving')).toMatch(/height:\s*480px/);
    expect(rule(css, '.artifact-embed iframe')).toMatch(/height:\s*480px/);
  });

  it('is the one-line note, not a frame, when the page is already open beside the thread', () => {
    const open = draw(ArtifactEmbed, { product: 'p', path: 'designs/w-1/pricing.html', open: true });
    expect(open).toContain('embed-collapsed');
    expect(open).not.toContain('artifact-embed-arriving');
  });
});

describe('a file tile, while the file is read', () => {
  const first = draw(MessageFiles, { product: 'p', paths: ['notes/plan.md'], revision: 1, onOpen: () => {} });

  it('is a tile of its finished size with its name, rather than nothing', () => {
    expect(first).toContain('class="message-file');
    expect(first).toContain('plan.md');
    expect(first).toMatch(/message-file-face[^"]*arriving/);
  });

  it('keeps the tile it had when the thread refreshes, instead of blinking out', () => {
    const tile = fs.readFileSync(new URL('../renderer/src/components/MessageFiles.tsx', import.meta.url), 'utf8');
    expect(tile).not.toMatch(/setGlance\(null\)/);
  });

  it('has a face as tall as a finished one', () => {
    expect(rule(tiles, '.message-file-face')).toMatch(/height:\s*104px/);
  });
});

describe('a folder of pictures, while its pictures are listed', () => {
  it('holds a row of picture boxes under its name', () => {
    const first = draw(FolderPreview, { product: 'p', folder: 'designs/w-1/', onOpen: () => {} });
    expect(first).toContain('folder-preview-name');
    expect(first).toContain('folder-preview-grid');
    expect((first.match(/folder-preview-shot[^"]*arriving/g) ?? []).length).toBe(3);
  });

  it('holds nothing when the message draws its own pictures, since it will stay one line', () => {
    const quiet = draw(FolderPreview, { product: 'p', folder: 'designs/w-1/', onOpen: () => {}, quiet: true });
    expect(quiet).not.toContain('folder-preview-grid');
    expect(quiet).not.toContain('arriving');
  });

  it('gives a waiting box the shape a picture there has', () => {
    expect(rule(css, '.folder-preview-shot.arriving')).toMatch(/aspect-ratio:\s*16\s*\/\s*10/);
  });

  it('keeps its shimmer over the folder button\'s own bare background', () => {
    // .folder-preview-shot sets background: none after .arriving; only the pair outweighs it.
    expect(rule(css, '.folder-preview-shot.arriving')).toMatch(/animation:\s*phone-shimmer/);
    expect(rule(css, '.message-file-face.arriving')).toMatch(/animation:\s*phone-shimmer/);
  });
});

describe('a picture still being looked for', () => {
  it('holds a picture\'s box rather than nothing', () => {
    const first = draw(ArtifactImg, { src: 'shots/a.png', roots: [], onOpen: () => {}, find: async () => null });
    expect(first).toMatch(/class="[^"]*inline-image[^"]*arriving/);
  });

  it('is still nothing when there is no way to look', () => {
    expect(draw(ArtifactImg, { src: 'shots/a.png', roots: [], onOpen: () => {} })).toContain('missing image');
  });
});

describe('a film, before it knows its size', () => {
  it('is as wide as the column at the height it will have, not the browser\'s 300 x 150', () => {
    const film = rule(css, '.inline-media video');
    expect(film).toMatch(/(?<![-\w])width:\s*100%/);
    expect(film).toMatch(/(?<![-\w])height:\s*360px/);
    expect(film).toMatch(/object-fit:\s*contain/);
  });

  it('leaves a sound\'s player its own size', () => {
    expect(rule(css, '.inline-media audio')).toMatch(/height:\s*36px/);
  });
});

describe('a chart, while it is drawn', () => {
  it('shimmers in a box nearer a chart\'s height', () => {
    // It reads the page's theme on its first frame, so it is read, not drawn.
    const chart = fs.readFileSync(new URL('../renderer/src/components/DiagramBlock.tsx', import.meta.url), 'utf8');
    expect(chart).toMatch(/className="diagram diagram-pending arriving"/);
    expect(rule(css, '.diagram-pending')).toMatch(/min-height:\s*(2\d\d|3\d\d)px/);
  });
});
