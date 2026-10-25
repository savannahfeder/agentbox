// THE STATUS COLUMN SAYS WHAT EACH THREAD IS DOING (w-ec2b04d449).
//
// Two power test runs found In progress drawing eight rows that read the same.
// Two had an agent on them, four were waiting their turn, one was out of Codex
// usage and one was signed out, and the only difference on screen was a small
// mark before two of the titles: "new threads sit Queued with no sign of it in
// the list, and no word on why". Measured again on this branch before the
// change, with the testers' own fleet: the table drew thread, project,
// priority and updated, and not one of those four said a word about an agent.
//
// The founder picked the status column out of five drawn options, with the
// cloud mark moved into it and no text between the board's cards.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { factsFor, saysOnCard, statusCell } from '../renderer/src/status-word.ts';
import { ThreadCells, LiveContext, CloudContext } from '../renderer/src/threads/Pages.tsx';
import { FleetContext } from '../renderer/src/fleet.ts';

const NOW = Date.parse('2026-10-20T20:31:00Z');
const MIN = 60_000;

const item = (over = {}) => ({
  id: 'w-1', product: 'payments', productName: 'Payments API',
  status: 'open', title: 'Write tests for the refund flow', kind: 'task',
  labels: ['founder'], priority: 4, epoch: 1, claim: null,
  createdAt: NOW - 6 * MIN, updatedAt: NOW - 6 * MIN,
  ...over,
});

const session = (over = {}) => ({ itemId: 'w-1', product: 'payments', startedAt: NOW - 4 * MIN, tail: [], ...over });

const inProgress = (over = {}) => ({ inProgress: true, now: NOW, ...over });

describe('what one thread is doing, in one word', () => {
  it('says Working while an agent is on it', () => {
    const status = statusCell(item(), inProgress({ session: session() }));
    expect(status.word).toBe('Working');
    expect(status.live).toBe(true);
  });

  // The reported case: the agent had written a checkpoint, so the thread was
  // no longer "sent and untouched" and the panel called it Waiting while the
  // conversation under it read "Editing tokens.css".
  it('says Working even where the agent has already written something', () => {
    const said = item({ note: 'The tokens are in three files.' });
    expect(statusCell(said, inProgress({ session: session() })).word).toBe('Working');
  });

  it('says so with the cloud mark when the run is in the cloud', () => {
    const status = statusCell(item(), inProgress({ session: session({ where: 'cloud' }) }));
    expect(status.word).toBe('Working');
    expect(status.cloud).toBe(true);
  });

  it('says Queued, never Working, while it waits its turn', () => {
    const status = statusCell(item(), inProgress({ queued: ['w-1'] }));
    expect(status.word).toBe('Queued');
    expect(status.live).toBe(false);
  });

  it('says Up next on the one pushed with Run now', () => {
    expect(statusCell(item(), inProgress({ queued: ['w-1'], runNow: ['w-1'] })).word).toBe('Up next');
  });

  // The limit and the sign-in beat the queue: an agent is NOT about to start.
  it('says At its limit rather than Queued when every login is out of usage', () => {
    const status = statusCell(item(), inProgress({ queued: ['w-1'], atLimit: { 'w-1': { tool: 'Codex', until: NOW + 52 * MIN } } }));
    expect(status.word).toBe('At its limit');
    expect(status.title).toContain('Codex');
  });

  it('says Signed out rather than Queued when the tool it runs on is signed out', () => {
    const status = statusCell(item(), inProgress({ queued: ['w-1'], signInNeeded: { 'w-1': 'Codex' } }));
    expect(status.word).toBe('Signed out');
    expect(status.title).toContain('Codex');
  });

  it('says Nothing running on a thread in In progress that nothing is going to touch', () => {
    expect(statusCell(item(), inProgress({ queued: [] })).word).toBe('Nothing running');
  });

  // Nothing running is a claim about the whole fleet. Said where the fleet has
  // not been read it would be a guess, and said over a thread another Mac has
  // claimed it would be wrong.
  it('says In progress instead of guessing when nothing has read the fleet', () => {
    expect(statusCell(item(), inProgress()).word).toBe('In progress');
  });

  // It said the tab's own name here, with no mark, and nobody could tell what
  // that meant beside the Working rows (w-ae746145fc).
  it('says Working on a thread another worker holds the claim on', () => {
    const held = item({ status: 'claimed', claim: { holder: 'mcp-2', leaseUntil: NOW + 5 * MIN } });
    expect(statusCell(held, inProgress({ queued: [] })).word).toBe('Working');
  });

  it('says Stopped where the worker died', () => {
    expect(statusCell(item(), inProgress({ stalled: true })).word).toBe('Stopped');
  });

  it('says Nothing came back where the run ended quietly', () => {
    const status = statusCell(item(), inProgress({ silent: { runs: 1, endedAt: NOW - 9 * MIN } }));
    expect(status.word).toBe('Nothing came back');
  });

  it('says Paused while agents are paused', () => {
    expect(statusCell(item(), inProgress({ paused: true })).word).toBe('Paused');
  });

  it('says Shipping while the app owes it a ship', () => {
    expect(statusCell(item(), inProgress({ shipping: true })).word).toBe('Shipping');
  });

  // Off In progress the column says the thread's own state, which is what the
  // four approved words are for.
  it('says Waiting on a thread waiting on you', () => {
    expect(statusCell(item({ kind: 'question', note: 'Two ways to do it.' }), { now: NOW }).word).toBe('Waiting');
  });

  it('says Done on a finished thread', () => {
    expect(statusCell(item({ status: 'done' }), { now: NOW }).word).toBe('Done');
  });

  it('says Scheduled on one coming back later, and Not started on one never sent', () => {
    expect(statusCell(item({ runAt: NOW + 2 * 3_600_000 }), { now: NOW }).word).toBe('Scheduled');
    expect(statusCell(item({ start: 'later' }), { now: NOW }).word).toBe('Not started');
  });
});

describe('the mark beside the word', () => {
  it('turns only while an agent is really on it', () => {
    expect(statusCell(item(), inProgress({ session: session() })).mark).toBe('working');
    expect(statusCell(item(), inProgress({ queued: ['w-1'] })).live).toBe(false);
  });

  // Waiting its turn is quiet; nothing can start it is the one worth a look.
  it('rings a queued thread faintly and a held one in the accent', () => {
    expect(statusCell(item(), inProgress({ queued: ['w-1'] })).mark).toBe('queued');
    expect(statusCell(item(), inProgress({ atLimit: { 'w-1': { tool: 'Codex', until: 0 } } })).mark).toBe('held');
    expect(statusCell(item(), inProgress({ signInNeeded: { 'w-1': 'Codex' } })).mark).toBe('held');
    expect(statusCell(item(), inProgress({ queued: [] })).mark).toBe('held');
  });
});

describe('the words that are not about an agent', () => {
  // Three accent dots down a Needs you column say "needs you" three more times
  // and nothing else, so only the words about an agent carry a mark.
  it('carry no mark, because the tab over them has already said it', () => {
    expect(statusCell(item({ kind: 'question', note: 'Two ways.' }), { now: NOW }).agent).toBe(false);
    expect(statusCell(item({ status: 'done' }), { now: NOW }).agent).toBe(false);
    expect(statusCell(item({ start: 'later' }), { now: NOW }).agent).toBe(false);
    expect(statusCell(item(), inProgress()).agent).toBe(false);
  });

  it('and the words that are keep theirs', () => {
    expect(statusCell(item(), inProgress({ session: session() })).agent).toBe(true);
    expect(statusCell(item(), inProgress({ queued: ['w-1'] })).agent).toBe(true);
    expect(statusCell(item(), inProgress({ atLimit: { 'w-1': { tool: 'Codex', until: 0 } } })).agent).toBe(true);
    expect(statusCell(item(), inProgress({ queued: [] })).agent).toBe(true);
  });
});

describe('what the supervisor says about one thread', () => {
  it('is read off the fleet by id and nothing else', () => {
    const fleet = {
      sessions: new Map([['w-2', session({ itemId: 'w-2' })]]),
      queued: ['w-1'], atLimit: {}, signInNeeded: {}, shipping: [], stalled: [], silent: {}, runNow: [],
    };
    expect(factsFor(fleet, 'w-1').session).toBe(null);
    expect(statusCell(item(), inProgress(factsFor(fleet, 'w-1'))).word).toBe('Queued');
    expect(statusCell(item({ id: 'w-2' }), inProgress(factsFor(fleet, 'w-2'))).word).toBe('Working');
  });
});

describe('the row', () => {
  const draw = (fleet, row = item(), tab = 'progress') => renderToStaticMarkup(
    React.createElement(FleetContext.Provider, { value: fleet },
      React.createElement(LiveContext.Provider, { value: new Set(fleet.sessions ? [...fleet.sessions.keys()] : []) },
        React.createElement(CloudContext.Provider, { value: new Set() },
          React.createElement(ThreadCells, { item: row, product: { slug: 'payments', name: 'Payments API' }, now: NOW, tab })))));
  // What the cell draws, past its own opening tag: the hover sentence lives in
  // a title attribute there and carries the same words.
  const stateCell = (html) => {
    const open = html.indexOf('th-cell-state');
    return html.slice(html.indexOf('>', open) + 1, html.indexOf('th-cell-proj'));
  };

  it('draws the word in a cell of its own', () => {
    const html = draw({ queued: ['w-1'] });
    expect(html).toContain('th-cell-state');
    expect(html).toContain('Queued');
  });

  // The cloud moved into the status cell, so the title is only the title.
  it('keeps the running mark out of the title', () => {
    const html = draw({ sessions: new Map([['w-1', session()]]) });
    const title = html.slice(html.indexOf('th-cell-title'), html.indexOf('th-cell-state'));
    expect(title).not.toContain('th-st');
    expect(html.slice(html.indexOf('th-cell-state'))).toContain('th-st');
  });

  // "STATUS isn't properly lined up, it's off to the side", on a tab of
  // Waiting rows: a blank where the mark would be pushed every word in the
  // column off its own heading. The cell starts at the column's edge.
  it('puts nothing before a word that carries no mark', () => {
    const waiting = item({ kind: 'question', note: 'Two ways to do it.' });
    const cell = stateCell(draw({ queued: [] }, waiting, 'inbox'));
    expect(cell).toContain('Waiting');
    expect(cell).not.toContain('<span');
  });

  it('and leads with the mark where there is one', () => {
    const cell = stateCell(draw({ queued: ['w-1'] }));
    expect(cell.indexOf('th-st')).toBeLessThan(cell.indexOf('Queued'));
  });
});

describe('the card', () => {
  // A board is a board: the column already says Waiting, so a card in it that
  // repeats the word is text for nothing.
  it('says the word inside the card only where it adds to the column it is in', () => {
    const queued = statusCell(item(), inProgress({ queued: ['w-1'] }));
    expect(saysOnCard(queued, item(), 'running')).toBe(true);
    const waiting = statusCell(item({ kind: 'question', note: 'Two ways.' }), { now: NOW });
    expect(saysOnCard(waiting, item(), 'waiting')).toBe(false);
    const done = statusCell(item({ status: 'done' }), { now: NOW });
    expect(saysOnCard(done, item({ status: 'done' }), 'done')).toBe(false);
  });
});
