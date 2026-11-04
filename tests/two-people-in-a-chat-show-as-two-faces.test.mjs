// TWO PEOPLE IN A CHAT SHOW AS TWO FACES OF ONE SIZE (w-b5f23cff71).
//
// "When you have two people in the chat, their face images stretch and they
// look really weird." A chat card's faces sat in a two-column grid and every
// face was forced to fill its cell (`.ev-mosaic` with `width: 100% !important;
// height: 100% !important`), so on a 52-point card two photos were each 25 wide
// and 52 tall. Seen on the built app's "Maya, Priya" and "Kai, Omar" cards
// (designs 67 and 74). Now a chat of two or more wears two faces with equal
// sides, the second over the first's edge, the way the Messages list draws a
// group. They are round since tests/a-persons-face-is-drawn-by-the-one-component.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemberFace } from '../renderer/src/team/everything/TeamStrip.tsx';

const css = fs.readFileSync(new URL('../renderer/src/team/everything/everything.css', import.meta.url), 'utf8');
const face = (name, url = null) => ({ name, url });
const chat = (faces) => ({ key: 'room:r-1', kind: 'chat', name: 'A chat', faces, agents: null, now: null });
const draw = (faces, size = 52) => renderToStaticMarkup(h(MemberFace, { m: chat(faces), size }));
const sides = (html) => [...html.matchAll(/style="width:(\d+)px;height:(\d+)px/g)].map((m) => [Number(m[1]), Number(m[2])]);

describe('a chat card\'s faces', () => {
  it('are two squares of one size for two people, photos or initials', () => {
    for (const faces of [[face('Maya Chen', 'data:image/jpeg;base64,AA'), face('Priya Nair', 'data:image/jpeg;base64,AA')], [face('Kai Moreno'), face('Omar Haddad')]]) {
      const html = draw(faces);
      expect(html).toContain('class="ev-two"');
      expect(sides(html).slice(1)).toEqual([[31, 31], [31, 31]]);
    }
  });

  it('are still two squares for a group of four, its first two people', () => {
    const html = draw([face('Maya Chen'), face('Priya Nair'), face('Theo Park'), face('Jonah Weiss')]);
    expect(sides(html).slice(1)).toEqual([[31, 31], [31, 31]]);
    expect(html).not.toContain('TH');
  });

  it('are one square the card\'s full size for a chat with one face', () => {
    expect(sides(draw([face('Jonah Weiss')]))).toEqual([[52, 52]]);
  });

  it('are the room mark for a room with no faces', () => {
    expect(draw([])).toContain('>#</span>');
  });

  it('are never stretched to fill a cell', () => {
    expect(css).not.toMatch(/100% !important/);
    expect(css).toMatch(/\.ev-two \.tm-av:last-child \{[^}]*right: 0; bottom: 0;/);
  });
});
