// AN OPEN THREAD WAITING ON YOUR YES STOPS SAYING IT IS WORKING.
//
// Reported (QA batch 007, F-135): the commit card sat there with Allow and Deny
// on it while the line under the conversation still shimmered "Saving the
// changes… just now". The thread looked busy saving at the exact moment nothing
// was happening on it but you.
//
// `liveLine` has had the rule since F-120 and a test already pins it: `asking`
// is read above the session, so a worker stopped on a card reads Asking rather
// than Working. The rule was never reached here. The lists build their facts
// with `factsFor`, which reads `asking` off the fleet; the open thread built an
// object of its own by hand, and that hand-written object had no `asking` in
// it. One fact, two readers, and only one of them was looking.
//
// So the open thread reads `factsFor` too, and this holds both halves: the
// shared builder keeps carrying `asking`, and App.tsx keeps using the builder
// rather than growing a second copy that can fall behind it again.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Live } from '../renderer/src/components/Live';
import { factsFor } from '../renderer/src/status-word';
import { liveLine } from '../renderer/src/live-line';

globalThis.React = React;

const here = path.dirname(fileURLToPath(import.meta.url));
const item = { id: 'w-1', product: 'p', status: 'open', kind: 'directive', title: 't', labels: [], priority: 5, createdAt: 0, updatedAt: 0 };
const session = { itemId: 'w-1', product: 'p', startedAt: Date.now() - 20_000, tail: [], activity: [{ id: 'a', label: 'Saving the changes', detail: 'git commit -m "document greet parameter"' }] };
const draw = (facts) => renderToStaticMarkup(React.createElement(Live, { item, facts }));

describe('the line under an open conversation', () => {
  const fleet = { sessions: new Map([['w-1', session]]), asking: ['w-1'] };

  it('says the agent is asking you, not that it is saving', () => {
    const live = liveLine(item, { ...factsFor(fleet, 'w-1'), inProgress: true });
    expect(live.state).toBe('asking');
  });

  // The reported screen: the shimmer and the step's own words are what made it
  // read as busy, so neither may be drawn while a card waits.
  it('drops the shimmer and the step it was in the middle of', () => {
    const html = draw({ ...factsFor(fleet, 'w-1'), inProgress: true });
    expect(html).not.toContain('Saving the changes');
    expect(html).not.toContain('is-shimmering');
    expect(html).toContain('Asking');
  });

  // The boundary on the other side: the same run with no card waiting is
  // working, and the shimmer belongs there.
  it('still says working while no card is waiting', () => {
    const live = liveLine(item, { ...factsFor(fleet, 'w-1'), asking: false, inProgress: true });
    expect(live.state).toBe('working');
  });

  // And the card that names another thread is not this one's.
  it('is not said on the thread beside the one being asked about', () => {
    const facts = factsFor({ sessions: new Map([['w-2', { ...session, itemId: 'w-2' }]]), asking: ['w-1'] }, 'w-2');
    expect(facts.asking).toBe(false);
  });
});

// READ AS TEXT ON PURPOSE. The fault was a prop built by hand in a 7,000-line
// component that no test renders, and what went wrong was a field left out of
// it. Only the source says whether that is still true.
describe('the pane that draws it', () => {
  const app = fs.readFileSync(path.join(here, '..', 'renderer/src/App.tsx'), 'utf8');

  it('hands the open thread the same facts every list reads', () => {
    expect(app).toMatch(/live=\{\{\s*\n\s*\.\.\.factsFor\(fleet, focused\.id\)/);
  });
});
