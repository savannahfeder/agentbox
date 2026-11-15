// PICKING CLOUD ON A THREAD SHOWS CLOUD PICKED (w-bac3eb6bd2).
//
// "When I select cloud here, it often just won't change. It'll say This Mac
// ... I keep having to click it and nothing's happening." The thread had been
// handed back by the cloud for a Claude sign-in and a reply was running on this
// Mac. Picking Cloud let the cloud have it again, but the running reply could
// not move, so the view fell to "a run here the cloud cannot take": the button
// still read This Mac and Cloud was disabled with no disabled look. Every
// further press did nothing. Reproduced with placeView on the facts the app
// sends once the pick lands ({ place: 'here', running: true, why: handed-back }).
//
// Now the picker shows the thread's setting, and the note says where the
// reply already under way finishes. A Cloud that truly cannot be picked looks
// it, and the panel shows a pick before the app's next snapshot arrives.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { placeView, afterPick, PlaceButton } from '../renderer/src/threads/PlaceButton.tsx';
import { freshCopy } from '../renderer/src/stay-with-a-command.ts';

globalThis.React = React;
const handedBack = { at: 'mac', why: 'handed-back', detail: 'your Claude sign-in, for the testers’ agents' };

describe('a reply on this Mac the cloud cannot take yet', () => {
  it('shows Cloud picked once Cloud is picked, and says this reply finishes here (the reported case)', () => {
    const v = placeView({ place: 'here', running: true, why: handedBack });
    expect(v).toMatchObject({ word: 'Cloud', on: 'cloud', pickMac: true });
    expect(v.note).toBe('This reply needs your Claude sign-in, for the testers’ agents, so it finishes on this Mac. The next one starts in the cloud.');
  });

  it('says other reasons in their own words', () => {
    expect(placeView({ place: 'here', running: true, why: { at: 'mac', why: 'cloud-no-room', detail: 'agents' } }).note)
      .toBe('Every cloud agent on your plan was busy when it started. This reply finishes on this Mac, and the next one starts in the cloud.');
    expect(placeView({ place: 'here', running: true, why: { at: 'mac', why: 'handed-back', detail: 'merging into main' } }).note)
      .toBe('Merging into main happens on this computer. This reply finishes on this Mac, and the next one starts in the cloud.');
  });

  it('does not repeat a keep the person has just undone', () => {
    const v = placeView({ place: 'here', running: true, why: { at: 'mac', why: 'kept' } });
    expect(v.on).toBe('cloud');
    expect(v.note).toBe('This reply finishes on this Mac, and the next one starts in the cloud.');
  });

  it('promises nothing about the next reply where the cloud is out for now', () => {
    const v = placeView({ place: 'here', running: true, why: { at: 'mac', why: 'cloud-failing' } });
    expect(v.on).toBe('cloud');
    expect(v.note).toMatch(/This reply finishes on this Mac\.$/);
    // No reason means the cloud is on "when this Mac is full", where the next reply may stay here.
    expect(placeView({ place: 'here', running: true }).note).toBe('This reply finishes on this Mac.');
  });

  it('keeps Cloud out of reach where no reply of this thread can go there', () => {
    for (const why of ['folder', 'codex-reply', 'no-account', 'version']) {
      const v = placeView({ place: 'here', running: true, why: { at: 'mac', why, detail: 'claude' } });
      expect(v).toMatchObject({ word: 'This Mac', on: 'mac', pickCloud: null });
    }
    expect(placeView({ place: 'here', running: true, why: { at: 'mac', why: 'folder' } }).note).toBe('It works in a folder that stays on this computer.');
  });

  it('a run moving to the cloud already reads Cloud', () => {
    const v = placeView({ place: 'move', running: true, why: { at: 'mac', why: 'moving' } });
    expect(v).toMatchObject({ word: 'Cloud', on: 'cloud', pickMac: true });
    expect(v.note).toMatch(/as soon as the cloud has room/);
    // Not moving yet, Cloud is what sends it now.
    expect(placeView({ place: 'move', running: true })).toMatchObject({ word: 'This Mac', on: 'mac', pickCloud: 'move' });
  });

  it('changes nothing for a thread with no reply under way', () => {
    expect(placeView({ place: 'here' })).toMatchObject({ word: 'Cloud', on: 'cloud', pickMac: true });
    expect(placeView({ place: 'kept' })).toMatchObject({ word: 'This Mac', on: 'mac', pickCloud: false });
  });
});

describe('a pick shows at once', () => {
  it('as the place it leads to, before the app says so', () => {
    const needs = { place: 'needs', running: true, why: handedBack, needs: 'your Claude sign-in' };
    expect(placeView(afterPick(needs, false))).toMatchObject({ word: 'Cloud', on: 'cloud', needs: null });
    expect(placeView(afterPick({ place: 'kept' }, false))).toMatchObject({ word: 'Cloud', on: 'cloud' });
    expect(placeView(afterPick({ place: 'move', running: true }, 'move'))).toMatchObject({ word: 'Cloud', on: 'cloud' });
    expect(placeView(afterPick({ place: 'cloud' }, true))).toMatchObject({ word: 'This Mac', on: 'mac', pickCloud: false });
    expect(placeView(afterPick({ place: 'here', running: true, why: handedBack }, true))).toMatchObject({ on: 'mac' });
  });
});

// THE OPEN THREAD KEPT ITS OLD MARKS. The page holds the copy of the row it
// opened and takes a new one only when the row's `updatedAt` moves, but keep-
// on-this-Mac and a hand-back are laid over the row by the supervisor without
// touching it. Measured in the built renderer: after Cloud was picked and the
// snapshot dropped `needsMac`, the open page still drew the needs panel.
describe('the open thread hears a pick', () => {
  const opened = { id: 'w-a', product: 'p', updatedAt: 5, needsMac: 'your Stripe key' };
  it('takes the copy without the hand-back once Cloud is picked', () => {
    const fresh = { id: 'w-a', product: 'p', updatedAt: 5 };
    expect(freshCopy([fresh], opened, null)).toBe(fresh);
  });

  it('takes the copy without the keep, and with one', () => {
    const fresh = { id: 'w-a', product: 'p', updatedAt: 5 };
    expect(freshCopy([fresh], { ...fresh, onMac: true }, null)).toBe(fresh);
    const kept = { ...fresh, onMac: true };
    expect(freshCopy([kept], { ...fresh }, null)).toBe(kept);
  });

  it('still leaves the page alone on a poll that changed nothing', () => {
    expect(freshCopy([{ ...opened }], opened, null)).toBeNull();
    expect(freshCopy([{ id: 'w-a', product: 'p', updatedAt: 5 }], { id: 'w-a', product: 'p', updatedAt: 5 }, null)).toBeNull();
  });
});

describe('a choice that cannot be picked', () => {
  it('is drawn disabled, and the panel draws it dim with no hover', () => {
    const html = renderToStaticMarkup(React.createElement(PlaceButton, { place: 'here', running: true, why: { at: 'mac', why: 'folder' }, startOpen: true }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Cloud<\/button>/);
    const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.th-cloud-pop \.opts > button:disabled[^{]*\{[^}]*opacity/);
  });
});
