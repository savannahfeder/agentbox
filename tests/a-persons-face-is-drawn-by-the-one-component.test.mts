// "Like how you rounded team profile pics, that should happen anywhere, including
// here." The Team panel of a group chat drew big square faces while the faces
// row drew circles: two components (Face, RoomFace), a hand-drawn <img> in the
// teammate chat, a <span> in the mention menu, and CSS rules each giving a face
// or a mark its own corner. Counted before the change: 2 components, 4
// hand-drawn faces, 11 corner overrides. Now one component draws every person,
// round, and AI teammates keep a dashed mark with one soft corner.
//
// The same request covers artifacts: inline pictures had no corner at all, and
// pictures, PDF pages, decks and films had 0, 6, 8 and 10px. They take one token.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'renderer/src');
const read = (p) => readFileSync(join(root, p), 'utf8');

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});
const files = walk(src);
const tsx = files.filter((f) => f.endsWith('.tsx'));
const css = files.filter((f) => f.endsWith('.css'));
const allCss = css.map((f) => readFileSync(f, 'utf8')).join('\n');
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every `selector { ... }` rule whose selector list names `target` as its subject. */
const rulesEndingIn = (target) => [...stripComments(allCss).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter((m) => m[1].split(',').some((s) => s.trim().endsWith(target)))
  .map((m) => ({ selector: m[1].trim(), body: m[2] }));
const radiiOn = (target) => rulesEndingIn(target).filter((r) => /border-radius:/.test(r.body));

describe('a person is drawn by one component', () => {
  it('keeps the class that draws a face inside team/people.tsx', () => {
    const others = tsx
      .filter((f) => !f.endsWith('team/people.tsx'))
      .filter((f) => /className=(["'`{])[^>]*\btm-av\b/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(src, f));
    expect(others).toEqual([]);
  });

  it('has no second face component and no second class', () => {
    expect(existsSync(join(src, 'team/rooms/RoomFace.tsx'))).toBe(false);
    const stale = [...tsx, ...css].filter((f) => /\bRoomFace\b|\brm-pic\b|\brm-ini\b/.test(readFileSync(f, 'utf8')));
    expect(stale.map((f) => relative(src, f))).toEqual([]);
  });

  it('draws nobody\'s picture by hand: an avatar reaches an <img> only in Face', () => {
    const others = tsx
      .filter((f) => !f.endsWith('team/people.tsx'))
      .filter((f) => /<img[^>]*(avatarUrl|mePic|\.avatar\b)/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(src, f));
    expect(others).toEqual([]);
  });
});

describe('a person is round', () => {
  it('rounds the face once, on the class itself', () => {
    const base = rulesEndingIn('.tm-av').find((r) => r.selector === '.tm-av');
    expect(base.body).toMatch(/border-radius: 50%/);
  });

  it('lets no surface give a person a corner of its own', () => {
    const corners = radiiOn('.tm-av').filter((r) => r.selector !== '.tm-av' && !/\.bot$/.test(r.selector));
    expect(corners.map((r) => r.selector)).toEqual([]);
  });

  it('draws a person round on a phone too, and a teammate round in a dashed ring', () => {
    const groups = read('mobile/src/ui/Groups.tsx');
    const face = groups.slice(groups.indexOf('export function Face'), groups.indexOf('const PeopleGlyph'));
    expect(face).toMatch(/borderRadius: s \/ 2/);
    const mates = read('mobile/src/ui/Teammates.tsx');
    expect(mates).toMatch(/export const mateCorner = \(s: number\) => s \/ 2;/);
    const mark = mates.slice(mates.indexOf('export function TeammateMark'), mates.indexOf('/** Your own face'));
    expect(mark).toMatch(/borderRadius: mateCorner\(s\)/);
    expect(mark).toMatch(/borderStyle: 'dashed'/);
  });

  it('does not round what is not a person: a project keeps its corner, a group its tile', () => {
    expect(radiiOn('.product-mark')[0].body).toMatch(/var\(--radius\)/);
    expect(radiiOn('.ev-hash').every((r) => /var\(--artifact-corner-small\)/.test(r.body))).toBe(true);
    expect(allCss).not.toMatch(/\.th-mark[^{]*\{[^}]*border-radius: 50%/);
  });
});

describe('an AI teammate is dashed and round, the same everywhere', () => {
  it('declares one corner, round like a person (it was a 28% tile that read as square)', () => {
    expect(allCss.match(/--mate-corner:\s*[^;]+;/g)).toEqual(['--mate-corner: 50%;']);
  });

  it.each(['.tq', '.agent-face', '.ev-ai', '.tm-av.bot'])('%s wears that corner and no other', (mark) => {
    const radii = radiiOn(mark);
    expect(radii.length).toBeGreaterThan(0);
    for (const r of radii) expect(r.body, r.selector).toMatch(/border-radius: var\(--mate-corner\)/);
  });

  it('stays dashed', () => {
    for (const mark of ['.tq', '.agent-face', '.ev-ai']) {
      const dashed = rulesEndingIn(mark).some((r) => /border: 1px dashed/.test(r.body));
      expect(dashed, mark).toBe(true);
    }
    expect(rulesEndingIn('.tm-av.bot')[0].body).toMatch(/border-style: dashed/);
  });
});

describe('an artifact has one soft corner', () => {
  const big = ['.inline-image', '.av-picture', '.pdf-page', '.deck-slide', '.film-frame[style]', '.pv-img', '.doc-picture', '.message-file'];
  const small = ['.deck-slide.is-small', '.pv-thumb', '.attach-thumb img', '.attach-chip', '.message-file-face', '.folder-preview-shot img'];

  it('declares both corners once', () => {
    expect(allCss.match(/--artifact-corner:\s*[^;]+;/g)).toEqual(['--artifact-corner: 10px;']);
    expect(allCss.match(/--artifact-corner-small:\s*[^;]+;/g)).toEqual(['--artifact-corner-small: 6px;']);
  });

  it.each(big)('%s takes the corner', (sel) => {
    const rule = radiiOn(sel).find((r) => r.selector === sel);
    expect(rule?.body, sel).toMatch(/border-radius: ?var\(--artifact-corner\)/);
  });

  it.each(small)('%s, being small, takes the small corner', (sel) => {
    const rule = radiiOn(sel).find((r) => r.selector === sel);
    expect(rule?.body, sel).toMatch(/border-radius: ?var\(--artifact-corner-small\)/);
  });

  it('rounds the picture, not an empty box around it, in the pane beside a thread', () => {
    // `.doc-view` fills the pane and object-fit letterboxes inside it, and padding
    // eats the corner: both leave the painted picture square.
    const picture = rulesEndingIn('.doc-picture').find((r) => r.selector === '.doc-picture').body;
    expect(picture).not.toMatch(/padding/);
    expect(picture).toMatch(/width: auto/);
  });

  it('leaves the window\'s own surfaces alone: a browsed page stays flush', () => {
    expect(allCss).toMatch(/\.doc-pane\.doc-browsing \.doc-card \{[^}]*border-radius: 0/);
  });
});
