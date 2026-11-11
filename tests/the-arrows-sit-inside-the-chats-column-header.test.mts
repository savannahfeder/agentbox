// THE ARROWS SIT INSIDE THE CHATS COLUMN HEADER.
//
// What broke: on Chats, Groups and Team the header's first column (.gc-head)
// pulls itself left by the bar's own padding so its edge lines up with the
// list under it. The back and forward arrows sit before it in the same bar, so
// the pull laid the column over them: the forward arrow ran into "Chats", and
// the column's dividing line moved right by the arrows' width, off the list's
// edge. Measured from the person's screenshot: the divider at 349px, the list's
// edge at 264px.
//
// The column now starts where it did without the arrows, and its name moves
// right past them. The arrows stay above it, so they can still be clicked.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, '..', 'renderer/src/styles.css'), 'utf8');
const rooms = fs.readFileSync(path.join(here, '..', 'renderer/src/team/rooms/rooms.css'), 'utf8');
const rule = (sel: string) => {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? null : css.slice(at, css.indexOf('}', at));
};

describe('a page whose header has a list column (Chats, Groups, Team)', () => {
  // The pull the column makes without the arrows, which these rules extend.
  it('still pulls its column to the card edge without the arrows', () => {
    expect(rooms).toMatch(/\.gc-head \{[^}]*margin-left: -32px/);
    expect(rooms).toMatch(/\.gt-inset \.gc-head \{ margin-left: -44px; \}/);
  });

  it('pulls further by the arrows, so the column line stays on the list edge', () => {
    expect(rule('.app.back-forward-on .topbar > .back-forward + .gc-head')).toMatch(/margin-left: calc\(-32px - var\(--bf-w\)\)/);
    expect(rule('.app.back-forward-on.gt-inset .topbar > .back-forward + .gc-head')).toMatch(/margin-left: calc\(-44px - var\(--bf-w\)\)/);
  });

  it('starts the column name after the arrows', () => {
    expect(rule('.app.back-forward-on .topbar > .back-forward + .gc-head > .gc-head-col')).toMatch(/padding-left: calc\(32px \+ var\(--bf-w\)\)/);
    expect(rule('.app.back-forward-on.gt-inset .topbar > .back-forward + .gc-head > .gc-head-col')).toMatch(/padding-left: calc\(44px \+ var\(--bf-w\)\)/);
  });

  it('keeps the arrows on top, where they can be clicked', () => {
    expect(rule('.app.back-forward-on .topbar > .back-forward')).toMatch(/position: relative;[^}]*z-index: 2/);
  });

  it('knows the arrows are two 26px buttons, a 2px gap and a 12px margin', () => {
    expect(css).toMatch(/\.app\.back-forward-on \{ --bf-w: 66px; \}/);
    expect(css).toMatch(/\.back-forward \{[^}]*gap: 2px; margin-right: 12px;/);
    expect(css).toMatch(/\.back-forward button \{\s*width: 26px;/);
  });
});
