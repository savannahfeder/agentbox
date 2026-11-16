// THE RUNS ON BUTTON NAMES THIS MAC WHILE A REPLY RUNS HERE.
//
// What broke (overnight Cloud testers, 2026-11-16): with the cloud on, a
// thread's run moved to this Mac ("Moved to this Mac", "on your computer"), yet
// its top bar button said Runs on: Cloud with a cloud mark. One said so while a
// Ship it merged on this computer. placeView answers the thread's setting (the
// panel's pick, so Cloud stays pickable: picking-cloud-on-a-thread-shows-cloud-
// picked), and the closed button drew that setting too. Measured by rendering
// PlaceButton on the facts the app sends for such a thread
// ({ place: 'here', running: true, why: cloud-refused }): aria-label
// "Runs on: Cloud".
//
// Now the closed button names where the thread runs now, and the panel still
// shows the setting with its note that this reply finishes on this Mac.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlaceButton, afterPick, placeView } from '../renderer/src/threads/PlaceButton.tsx';

globalThis.React = React;
const label = (facts: Parameters<typeof placeView>[0]) =>
  /class="ts-done ts-place[^"]*"[^>]*aria-label="([^"]*)"/.exec(renderToStaticMarkup(React.createElement(PlaceButton, facts)))?.[1];

describe('a reply running on this Mac with the cloud on', () => {
  it('names This Mac after the cloud could not start it and it moved here (the reported case)', () => {
    expect(label({ place: 'here', running: true, why: { at: 'mac', why: 'cloud-refused' } })).toBe('Runs on: This Mac');
  });

  it('names This Mac while a merge handed back by the cloud runs here', () => {
    expect(label({ place: 'here', running: true, why: { at: 'mac', why: 'handed-back', detail: 'merging into main' } })).toBe('Runs on: This Mac');
  });

  it('names This Mac with no reason given, and while it waits to move to the cloud', () => {
    expect(label({ place: 'here', running: true })).toBe('Runs on: This Mac');
    expect(label({ place: 'move', running: true, why: { at: 'mac', why: 'moving' } })).toBe('Runs on: This Mac');
    expect(label(afterPick({ place: 'move', running: true }, 'move'))).toBe('Runs on: This Mac');
  });

  it('keeps the panel on the setting, so Cloud stays picked and the note says where this reply finishes', () => {
    const v = placeView({ place: 'here', running: true, why: { at: 'mac', why: 'cloud-refused' } });
    expect(v).toMatchObject({ on: 'cloud', now: 'mac', pickMac: true });
    expect(v.note).toMatch(/This reply finishes on this Mac/);
  });
});

describe('a thread with no reply running here', () => {
  it('still names Cloud while it runs in the cloud, or its next reply starts there', () => {
    expect(label({ place: 'cloud' })).toBe('Runs on: Cloud');
    expect(label({ place: 'here' })).toBe('Runs on: Cloud');
  });

  it('still names This Mac where it is kept here or the cloud is off', () => {
    expect(label({ place: 'kept' })).toBe('Runs on: This Mac');
    expect(label({ place: 'off' })).toBe('Runs on: This Mac, the cloud is off');
  });
});
