// THE ROOMS PAGE DOES NOT SAY YOU ARE IN NONE BEFORE THEY LOAD (w-3d0fa23ffb, 2026-10-22).
//
// The power tester opened the app and the rooms list showed only "New room":
// "first glance said I'm in no rooms". Astral was there a moment later, once
// the team's first sync had read it. Rooms now have a page of their own, and it
// said "You are not in any rooms yet." in that same moment. Until the rooms are
// read it says nothing. Drawn with React's own renderer.
import { it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomsPage } from '../renderer/src/team/rooms/RoomsPage.tsx';

const state = (ready) => ({ on: true, ready, rooms: [], messages: {}, me: null, ranks: {}, invites: [], mentions: [], error: null });
const draw = (ready) => renderToStaticMarkup(createElement(RoomsPage, { state: state(ready), invisible: false, now: 0, onOpen() {}, onFind() {}, onMenu() {} }));

it('says nothing about your rooms before they are read', () => {
  expect(draw(false)).not.toMatch(/not in any rooms/);
});

it('says you are in none once they are read and there are none', () => {
  expect(draw(true)).toMatch(/You are not in any rooms yet\./);
});
