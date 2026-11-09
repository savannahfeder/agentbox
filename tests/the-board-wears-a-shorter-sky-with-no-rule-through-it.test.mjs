// THE BOARD WEARS A SHORTER SKY, WITH NO RULE THROUGH IT (2026-11-09).
//
// On the board there is no tab row, so the Inbox sky reached down over the
// column headings, and the header's 1px rule ran straight across the sky. The
// owner, on the picture: the area "is basically covered a little bit by our
// visuals. In Board view it probably has to take up a little less space", and
// "a weird hairline going through ... looks like an accident". Measured by
// reading home.css and App.tsx, and by screenshots of the board and the list.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const css = read('home/home.css');
const app = read('App.tsx');
const rule = (sel) => css.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

describe('under an Inbox sky', () => {
  it('the header draws no rule', () => {
    expect(rule('.app.sky-shown:not(.home-shown) > .topbar')).toMatch(/border-bottom-color:\s*transparent/);
  });

  it('Home keeps hiding its own header as before', () => {
    expect(rule('.app.home-shown > .topbar')).toContain('visibility: hidden');
  });
});

describe('on the board', () => {
  it('the window says it is the board, only while the sky is on', () => {
    expect(app).toContain("skyOnInbox ? (onBoard ? ' sky-shown sky-board' : ' sky-shown') : ''");
  });

  it('the same sky sits higher, cut at the card top, and is gone by the column headings', () => {
    const board = rule('.app.sky-board .inbox-sky-head');
    expect(board).toContain('transform: scaleY(-1) translateY(60px)');
    expect(board).toContain('clip-path: inset(0 0 60px 0 round var(--radius))');
    // 150px of mask less the 60px lift: clear by 90px, where the headings start.
    expect(board).toMatch(/mask-image: linear-gradient\(to top, #000 0, #000 105px, transparent 150px\)/);
  });

  it('the list keeps the approved sky (design 86)', () => {
    expect(rule('.inbox-sky-head')).toMatch(/mask-image: linear-gradient\(to top, #000 0, #000 70px, transparent 150px\)/);
    expect(app).toContain('<InboxSky art={sky.art} />');
  });
});
