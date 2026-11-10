// AN OPEN THREAD SAYS WHETHER IT RUNS ON THIS MAC OR IN THE CLOUD (2026-10-28).
//
// A tester with Cloud on and "Everything" ran a thread that stayed on the Mac,
// and reported "The thread does not say whether it runs in the cloud or on the
// Mac". The list said "Working locally" with the reason on hover, but the open
// thread's working line said only "Running sleep 240 3m", and at laptop width
// nothing else on that page says it. The approved design (design 1 of five on
// w-decf3c5062): the working line ends "on this Mac", and hovering it gives the
// same reason the list gives. A cloud run's line ends "in the cloud".
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Live } from '../renderer/src/components/Live';
import { livePlace } from '../renderer/src/live-line';
import { factsFor } from '../renderer/src/status-word';

globalThis.React = React;

const NOW = Date.now();
const running = (where) => ({ startedAt: NOW - 3 * 60_000, tail: [], activity: [{ id: 'a', label: 'Running sleep 240', detail: 'sleep 240', startedAt: NOW }], ...(where ? { where } : {}) });
const NO_ACCOUNT = { at: 'mac', why: 'no-account', detail: 'claude' };
const draw = (facts) => renderToStaticMarkup(React.createElement(Live, { item: { id: 'w-sleep', status: 'claimed' }, facts }));

describe('the working line of an open thread', () => {
  it('ends "on this Mac" and gives the reason on hover (the reported case)', () => {
    const html = draw({ session: running(), whyNotCloud: NO_ACCOUNT });
    expect(html).toContain('on this Mac');
    expect(html).toContain('Running on this Mac');
    expect(html).toContain('No Claude account is signed in to the cloud.');
    expect(html.match(/is-shimmering/g)).toHaveLength(1);
  });

  it('ends "in the cloud" on a cloud run, with nothing to explain', () => {
    const html = draw({ session: running('cloud') });
    expect(html).toContain('in the cloud');
    expect(html).not.toContain('th-why-card');
    expect(html).not.toContain('on this Mac');
  });

  it('says no place for a run on this Mac when the cloud is not set to Everything', () => {
    const html = draw({ session: running() });
    expect(html).not.toContain('on this Mac');
    expect(html).not.toContain('in the cloud');
  });

  it('says no place for a thread that has no run yet', () => {
    const html = draw({ queued: ['w-sleep'], whyNotCloud: { at: 'wait-cloud', why: 'cloud-full', detail: 10 } });
    expect(html).not.toContain('on this Mac');
    expect(html).not.toContain('in the cloud');
  });
});

describe('the place, in words', () => {
  it('is "this computer" where the computer is not a Mac', () => {
    const place = livePlace({ session: running(), whyNotCloud: NO_ACCOUNT }, { mac: false });
    expect(place.word).toBe('on this computer');
    expect(place.why.head).toBe('Running on this computer');
  });

  it('is "your computer" on a phone or in a browser tab, where "this" is the wrong machine', () => {
    const place = livePlace({ session: running(), whyNotCloud: NO_ACCOUNT }, { mac: true, tab: true });
    expect(place.word).toBe('on your computer');
    expect(place.why.head).toBe('Running on your computer');
  });

  it('carries the same reason the list gives', () => {
    const place = livePlace({ session: running(), whyNotCloud: { at: 'mac', why: 'kept' } }, { mac: true });
    expect(place.why.body).toBe('You chose to keep this thread on this computer.');
  });

  it('trusts the run over a stale reason when the run is in the cloud', () => {
    expect(livePlace({ session: running('cloud'), whyNotCloud: NO_ACCOUNT }, { mac: true })).toEqual({ word: 'in the cloud', why: null });
  });
});

// The list had the reason all along; the open thread was never handed it.
//
// It was pinned here as the literal line App.tsx wrote out by hand. That hand
// written object was itself the next bug (F-135, w-93ab9b1fcb): it had no
// `asking` in it either. Both panes now read `factsFor`, so the reason reaching
// the open thread is a fact about the one builder rather than about a line of
// JSX, and that is what this asks.
describe('the open thread', () => {
  it('is handed the same reason the list is', () => {
    const fleet = { whyNotCloud: { 'w-sleep': NO_ACCOUNT } };
    expect(factsFor(fleet, 'w-sleep').whyNotCloud).toEqual(NO_ACCOUNT);
    expect(factsFor(fleet, 'w-other').whyNotCloud).toBe(null);
  });
});
