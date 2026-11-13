// E ACTS ONLY ON THE THREAD ON SCREEN (2026-11-11).
//
// A synthetic tester on a three-person team had a file review open over a
// person's page and pressed E: "E closed blockers while review was displayed",
// and the one change that would raise his score was "E must act on the thread
// displayed". The person's page (the Team place), a full-window file opened from
// a chat on it, and the Team page have no key branch of their own, so the keys
// fell through to the Inbox's: E closed the Inbox's selected row, which none of
// them draw. Measured in App.tsx before the fix: the rule that keeps keys off a
// hidden row (`homeCoversTheList`) knew only Home, so `pointed` was the hidden
// row on every one of those screens. One rule now says when something covers
// the list, and E, L, R and the option numbers find no row while it does.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { somethingCoversTheList } from '../renderer/src/home/home-model.ts';
import { keyOnTheList } from '../renderer/src/reply-keys.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

const onTheList = { homeOn: true, homeOpen: false, threadOpen: false, searching: false, settingsOpen: false, teamShown: false, placeShown: false, fileOverTheList: false };

describe('something covers the list', () => {
  it('while a person or the team place is the page', () => {
    expect(somethingCoversTheList({ ...onTheList, placeShown: true })).toBe(true);
  });
  it('while a file is open over the whole window with no thread under it', () => {
    expect(somethingCoversTheList({ ...onTheList, fileOverTheList: true })).toBe(true);
  });
  it('while the Team page is the page', () => {
    expect(somethingCoversTheList({ ...onTheList, teamShown: true })).toBe(true);
  });
  it('while Home is the page, as before', () => {
    expect(somethingCoversTheList({ ...onTheList, homeOpen: true })).toBe(true);
  });
  it('not on the Inbox list itself, so E there still closes the selected row', () => {
    expect(somethingCoversTheList(onTheList)).toBe(false);
    expect(keyOnTheList({ key: 'e', justChanged: false, nothingToActOn: false })).toBe('shortcut');
  });
  it('not with a thread open: its own branch answers E, on the thread drawn', () => {
    expect(somethingCoversTheList({ ...onTheList, threadOpen: true, fileOverTheList: true })).toBe(false);
  });
  it('and with it covered, E, L, R and the numbers find no row', () => {
    for (const key of ['e', 'l', 'r', '1', '2']) expect(keyOnTheList({ key, justChanged: false, nothingToActOn: true })).toBe('nowhere');
  });
});

describe('App.tsx', () => {
  const ask = app.slice(app.indexOf('const listCovered = somethingCoversTheList('), app.indexOf('const pointed: WorkItem | undefined'));
  const pointed = app.slice(app.indexOf('const pointed: WorkItem | undefined'), app.indexOf('const keyTab ='));
  it('asks once, with the place, the lone file and the Team page', () => {
    expect(ask).toMatch(/placeShown: chatsPlaceShown/);
    expect(ask).toMatch(/fileOverTheList: fullScreenDoc/);
    expect(ask).toMatch(/teamShown/);
  });
  it('puts no row under the keys while the list is covered, not even a hovered one', () => {
    expect(pointed).toMatch(/list\.find\(\(i\) => !listCovered && i\.id === hoveredId\)/);
    expect(pointed).toMatch(/listCovered \? undefined : current/);
    expect(pointed.indexOf('walkOwn')).toBeLessThan(pointed.indexOf('listCovered'));
  });
  it('counts nothing on the covered list as something to act on', () => {
    const line = app.slice(app.indexOf('const nothingToActOn ='), app.indexOf('\n', app.indexOf('const nothingToActOn =')));
    expect(line).toMatch(/listCovered \|\|/);
  });
});
