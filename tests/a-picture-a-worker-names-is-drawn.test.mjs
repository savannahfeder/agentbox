// A PICTURE A WORKER NAMES IN A MESSAGE IS DRAWN, NOT LINKED.
//
// The card she attached carried two screenshots a run had made her. Both showed
// as blue text, and the pictures were nowhere on the screen.
//
// COUNTED OVER HER AGENTBOX STORE THE SAME DAY, every way an AGENT has named a
// picture in a result, a checkpoint or a body it wrote:
//
//   bare path in prose    27    drew blue text
//   markdown image        25    drew the picture
//   path in a code span    4    drew the picture
//   markdown link          2    drew blue text
//
// So 29 of 58 drew nothing, and the commonest form was the worst one. Her own
// 108 mentions are pasted screenshots, which arrive as markdown images and
// always drew fine, which is exactly why this looked like it worked.
//
// The two ways that already drew the picture are held by
// a-picture-on-a-card-opens.test.mjs. This holds the two that did not.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkArtifactPaths } from '../renderer/src/remark-artifact-paths.ts';
import { docKind } from '../renderer/src/doc-pane.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const para = (...children) => ({ type: 'root', children: [{ type: 'paragraph', children }] });
const text = (value) => ({ type: 'text', value });
const only = (tree) => tree.children[0].children;

describe('a picture named in a sentence', () => {
  it('becomes the picture, which is the form she says every other agent uses', () => {
    const tree = para(text('attachments/w-ca2a64d560-terminal-corner-after.png'));
    linkArtifactPaths(tree);
    expect(only(tree)).toHaveLength(1);
    expect(only(tree)[0].type).toBe('image');
    expect(only(tree)[0].url).toBe('attachments/w-ca2a64d560-terminal-corner-after.png');
  });

  it('carries the path as its alt, so a missing file still says which one', () => {
    const tree = para(text('designs/w-805/the-shot.png'));
    linkArtifactPaths(tree);
    expect(only(tree)[0].alt).toBe('designs/w-805/the-shot.png');
  });

  it('draws both of the two her card named, on one line', () => {
    // Her card, verbatim: two paths separated by a single space.
    const tree = para(text('attachments/a-terminal-corner-after.png attachments/b-reply-model-drawer.png'));
    linkArtifactPaths(tree);
    expect(only(tree).filter((n) => n.type === 'image').map((n) => n.url))
      .toEqual(['attachments/a-terminal-corner-after.png', 'attachments/b-reply-model-drawer.png']);
  });

  it('draws a picture named mid-sentence without eating the sentence', () => {
    const tree = para(text('The corner is at designs/corner.png, have a look.'));
    linkArtifactPaths(tree);
    expect(only(tree).map((n) => n.type)).toEqual(['text', 'image', 'text']);
    expect(only(tree)[0].value).toBe('The corner is at ');
    expect(only(tree)[2].value).toBe(', have a look.');
  });

  it('covers every picture kind a worker writes', () => {
    for (const name of ['a.png', 'a.PNG', 'a.jpg', 'a.jpeg', 'a.gif', 'a.webp', 'a.svg']) {
      const tree = para(text(`shots/${name}`));
      linkArtifactPaths(tree);
      expect(only(tree)[0].type, name).toBe('image');
    }
  });
});

describe('what stays a link, because it is not a picture', () => {
  it('a page, which is the case this plugin was written for', () => {
    const tree = para(text('designs/dev-landing-shots/round19.html'));
    linkArtifactPaths(tree);
    expect(only(tree)[0].type).toBe('link');
  });

  it('a pdf and a csv, which open in the app that owns them', () => {
    for (const name of ['reports/audit.pdf', 'data/rows.csv']) {
      const tree = para(text(name));
      linkArtifactPaths(tree);
      expect(only(tree)[0].type, name).toBe('link');
    }
  });

  it('a url ending in .png, which is not a file of this product', () => {
    const tree = para(text('It is at https://example.com/shot.png today.'));
    linkArtifactPaths(tree);
    expect(only(tree).every((n) => n.type === 'text')).toBe(true);
  });

  it('a picture already inside a link somebody wrote, which must not nest', () => {
    const tree = para({
      type: 'link',
      url: 'https://example.com/a.png',
      children: [text('https://example.com/a.png')],
    });
    linkArtifactPaths(tree);
    expect(only(tree)).toHaveLength(1);
    expect(only(tree)[0].type).toBe('link');
    expect(only(tree)[0].children[0].type).toBe('text');
  });
});

// The fourth form, `[the shot](designs/x.png)`. The `a` component lives inside
// a useMemo in Focus and is not exported, so this is read off the source the
// way the other Focus rules in this suite are.
describe('a markdown link pointing at a picture', () => {
  it('is drawn as the picture rather than as blue text', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toContain('A LINK TO A PICTURE DRAWS THE PICTURE');
    // The `a` component hands an image href to ArtifactImg before it ever
    // reaches ArtifactLink.
    const a = focus.slice(focus.indexOf('a: ({ href, children }'), focus.indexOf('img: ({ src, alt }'));
    expect(a).toContain('ArtifactImg');
    expect(a).toMatch(/png\|jpe\?g\|gif\|webp\|svg/);
    expect(a.indexOf('ArtifactImg')).toBeLessThan(a.indexOf('ArtifactLink'));
    // A picture on the web is somebody else's and stays a link.
    expect(a).toContain('https?|data');
  });
});

// The other half of what she asked for: "a PNG viewer in the app itself".
describe('a picture she clicks opens in the pane, not in Preview', () => {
  it('is a kind the pane knows how to draw', () => {
    expect(docKind('attachments/pasted-2700.png')).toBe('image');
  });

  it('is drawn as the picture itself, on the app scheme a picture needs', () => {
    const pane = read('renderer/src/components/DocPane.tsx');
    expect(pane).toContain("kind === 'image'");
    expect(pane).toContain('pictureUrl(resolved)');
    expect(pane).toContain('doc-picture');
    // her window is served over http, and an http page may not load a
    // file:// picture. The pane must not reintroduce that.
    const branch = pane.slice(pane.indexOf("kind === 'image' ?"), pane.indexOf("kind === 'code' ?"));
    expect(branch).not.toContain('file://');
  });

  it('still gives her Preview, one press away in the header', () => {
    // The open mark hands the file to the operating system for every kind but
    // a change, so nothing she had on 08-20 is taken away.
    const pane = read('renderer/src/components/DocPane.tsx');
    expect(pane).toContain('openArtifactExternally');
  });

  it('draws the whole picture at any split, however wide the screenshot is', () => {
    const css = read('renderer/src/styles.css');
    const rule = css.slice(css.indexOf('.doc-picture {'), css.indexOf('}', css.indexOf('.doc-picture {')));
    expect(rule).toContain('object-fit: contain');
    expect(rule).toContain('max-width: 100%');
    expect(rule).toContain('max-height: 100%');
  });
});
