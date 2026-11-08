// THE PHONE APP'S THREAD MENU OFFERS THE DESKTOP'S THREAD ACTIONS WHERE THEY APPLY.
//
// Counted on 2026-11-08 against the desktop's thread menu
// (renderer/src/threads/ThreadMenu.tsx) and ⌘K (App.tsx itemCommands): the
// phone's More sheet had Later, Move to cloud, Run now, Pin, Mark unread and
// Close. It had no Rename, no Priority of its own, no Reopen on a closed
// thread, no Try again or Restart on a stopped one (its live line told you to
// send a message instead), no Keep on your computer, no Move to another
// project and no Stop repeating. Each is now offered by the desktop's own rule
// (try-again.ts, shared/move-thread.mts, threadPlace) and sends through the
// computer's own handler. Held here: each offered where it applies, and not
// where it does not, and what each press sends and says.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneSlug } from '../renderer/src/phone-rows';
import { phoneSender } from '../renderer/src/phone-send';
import { liveOf, moveChoices, offersOf, ruleFor } from '../mobile/src/lib/thread-offers';
import { planFor, runSteps } from '../mobile/src/lib/actions';

const NOW = Date.UTC(2026, 10, 8, 12);
const MIN = 60_000;
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const item = (over = {}) => ({ id: 'w-1', product: A, productName: 'Alpha', title: 'Draw it', kind: 'directive', labels: ['founder'], status: 'blocked', priority: 0, createdAt: NOW - 60 * MIN, updatedAt: NOW - MIN, ...over });
const session = (over = {}) => ({ itemId: 'w-1', product: A, startedAt: NOW - 14 * MIN, activity: [], tail: [], ...over });
// What the thread page hands it: the run, and what the computer says of its queue.
const facts = (over = {}) => ({ session: null, inProgress: false, now: NOW, queued: [], runNow: [], stalled: false, shipping: false, ...over });

describe('Rename', () => {
  it('on any thread the computer has made', () => {
    expect(offersOf(item(), facts()).rename).toBe(true);
    expect(offersOf(item({ status: 'done' }), facts()).rename).toBe(true);
  });
  it('not on one still waiting for the computer, nor an agent\'s own session', () => {
    expect(offersOf(item({ waitsForMac: true }), facts()).rename).toBe(false);
    expect(offersOf(item({ agent: { id: 'x' } }), facts()).rename).toBe(false);
  });
  it('sends the new name, and an empty one sends nothing', () => {
    const plan = planFor({ kind: 'rename', label: '  Fix the sign-in page ' }, item(), NOW);
    expect(plan.steps).toEqual([{ door: 'threadEdit', payload: { product: A, id: 'w-1', patch: { label: 'Fix the sign-in page' } } }]);
    expect(plan.toast).toBe('Renamed: Fix the sign-in page');
    expect(planFor({ kind: 'rename', label: '   ' }, item(), NOW)).toBeNull();
  });
});

describe('Priority', () => {
  it('on an open thread', () => {
    expect(offersOf(item(), facts()).priority).toBe(true);
  });
  it('not on a closed one, as the desktop\'s menu leaves it out', () => {
    expect(offersOf(item({ status: 'done' }), facts()).priority).toBe(false);
    expect(offersOf(item({ waitsForMac: true }), facts()).priority).toBe(false);
  });
  it('sends the level and says it as the desktop does', () => {
    const plan = planFor({ kind: 'priority', value: 9 }, item(), NOW);
    expect(plan.steps).toEqual([{ door: 'threadEdit', payload: { product: A, id: 'w-1', patch: { priority: 9 } } }]);
    expect(plan.toast).toBe('Priority: urgent');
  });
});

describe('Reopen', () => {
  it('on a closed thread', () => {
    expect(offersOf(item({ status: 'done' }), facts()).reopen).toBe(true);
  });
  it('not on an open one', () => {
    expect(offersOf(item(), facts()).reopen).toBe(false);
    expect(offersOf(item({ status: 'done', agent: { id: 'x' } }), facts()).reopen).toBe(false);
  });
  it('sends the reopen the computer already takes', () => {
    const plan = planFor({ kind: 'reopen' }, item({ status: 'done' }), NOW);
    expect(plan.steps).toEqual([{ door: 'reopen', payload: { product: A, id: 'w-1' } }]);
    expect(plan.toast).toBe('Reopened: Draw it');
  });
});

describe('Try again and Restart', () => {
  it('Try again on a thread a dead worker left', () => {
    const o = offersOf(item({ status: 'open' }), facts({ stalled: true }));
    expect(o.tryAgain).toBe(true);
    expect(o.restart).toBe(false);
  });
  it('Try again on one the app\'s own note says got nowhere', () => {
    const stuck = item({ status: 'open', result: 'Your reply did not reach this task. Send it again.', wrote: { result: { ts: NOW - MIN, source: 'agent' } } });
    expect(offersOf(stuck, facts()).tryAgain).toBe(true);
    expect(offersOf({ ...stuck, result: 'Done. The page loads in 2s now.' }, facts()).tryAgain).toBe(false);
  });
  it('neither while it runs, nor on an ordinary thread waiting on you', () => {
    expect(offersOf(item({ status: 'claimed' }), facts({ session: session(), inProgress: true, stalled: true })).tryAgain).toBe(false);
    expect(offersOf(item(), facts()).tryAgain).toBe(false);
    expect(offersOf(item(), facts()).restart).toBe(false);
  });
  it('Restart where it stopped and Try again does not apply, as ⌘K offers it', () => {
    // A closed thread is never tried again, but a stopped one can still be restarted.
    const o = offersOf(item({ status: 'done', answer: 'Go on' }), facts({ stalled: true }));
    expect(o.tryAgain).toBe(false);
    expect(o.restart).toBe(true);
  });
  it('Resume this agent on a closed thread nothing runs on, as ⌘K offers it, and not on one waiting for your answer', () => {
    expect(offersOf(item({ status: 'done' }), facts()).resume).toBe('done');
    expect(offersOf(item(), facts()).resume).toBe(null);
    expect(offersOf(item({ status: 'open' }), facts({ stalled: true })).resume).toBe(null);
    expect(offersOf(item({ status: 'claimed' }), facts({ session: session(), inProgress: true })).resume).toBe(null);
    expect(offersOf(item({ status: 'open' }), facts({ inProgress: true })).resume).toBe(null);
    expect(offersOf(item({ agent: { id: 'x' } }), facts()).resume).toBe(null);
    expect(planFor({ kind: 'resume' }, item(), NOW).steps).toEqual([{ door: 'resumeItems', payload: { ids: ['w-1'] } }]);
    expect(planFor({ kind: 'resume' }, item(), NOW).toast).toBe('1 resumed');
  });
  it('the stopped line says what the desktop\'s bar says, with no send a message', () => {
    const live = liveOf(item({ status: 'open' }), facts({ stalled: true }));
    expect(live.line).toBe('The agent stopped without finishing this.');
    expect(liveOf(item({ status: 'open', answer: 'Go on' }), facts({ stalled: true })).line).toBe('The agent stopped without finishing this. Your answer is still waiting.');
  });
  it('send what the desktop sends', () => {
    expect(planFor({ kind: 'try-again' }, item(), NOW).steps).toEqual([{ door: 'resumeItems', payload: { ids: ['w-1'] } }]);
    expect(planFor({ kind: 'try-again' }, item(), NOW).toast).toBe('Trying again now.');
    expect(planFor({ kind: 'restart' }, item(), NOW).steps).toEqual([{ door: 'redeliver', payload: { product: A, id: 'w-1' } }]);
    expect(planFor({ kind: 'restart' }, item(), NOW).toast).toBe('A fresh agent is picking this up → Alpha');
  });
});

describe('Keep on your computer', () => {
  it('where the computer leaves this project for the cloud and the thread is free to go', () => {
    expect(offersOf(item(), facts({ cloud: true })).place).toBe('here');
  });
  it('the other way on one kept, and Run on your computer on one in the cloud now', () => {
    expect(offersOf(item({ onMac: true }), facts({ cloud: true })).place).toBe('kept');
    expect(offersOf(item({ status: 'claimed' }), facts({ cloud: true, session: session({ where: 'cloud' }), inProgress: true })).place).toBe('cloud');
  });
  it('not without the cloud, on a closed thread, or where Move to cloud is offered instead', () => {
    expect(offersOf(item(), facts()).place).toBeNull();
    expect(offersOf(item({ status: 'done' }), facts({ cloud: true })).place).toBeNull();
    expect(offersOf(item({ status: 'claimed' }), facts({ cloud: true, session: session({ movable: true }), inProgress: true })).place).toBeNull();
  });
  it('sends the keep, and the let go', () => {
    expect(planFor({ kind: 'keep-here', keep: true }, item(), NOW)).toEqual({ steps: [{ door: 'setThreadOnMac', payload: { onMac: { 'w-1': true } } }], toast: 'This thread now runs only on your computer' });
    expect(planFor({ kind: 'keep-here', keep: false }, item(), NOW)).toEqual({ steps: [{ door: 'setThreadOnMac', payload: { onMac: { 'w-1': null } } }], toast: 'This thread can run on the cloud again' });
  });
});

describe('Move to another project', () => {
  it('on a thread nothing has run on', () => {
    expect(offersOf(item({ status: 'open' }), facts()).move).toBe(true);
  });
  it('not while it runs, once it changed code, once closed, or before the computer has it', () => {
    expect(offersOf(item({ status: 'claimed' }), facts({ session: session(), inProgress: true })).move).toBe(false);
    const failed = item({ note: 'It did not ship, and it went back to its agent: tests failed', wrote: { note: { ts: NOW - MIN, source: 'system' } } });
    expect(offersOf(failed, facts()).move).toBe(false);
    expect(offersOf(item({ status: 'done' }), facts()).move).toBe(false);
    expect(offersOf(item({ waitsForMac: true }), facts()).move).toBe(false);
  });
  it('lists the other projects on the same computer', () => {
    const products = [
      { slug: A, name: 'Alpha' },
      { slug: phoneSlug(DEV, 'beta'), name: 'Beta' },
      { slug: phoneSlug('0f0e0d0c0b0a', 'gamma'), name: 'Gamma' },
    ];
    expect(moveChoices(item(), products)).toEqual([{ slug: phoneSlug(DEV, 'beta'), name: 'Beta' }]);
  });
  it('sends the move with the project as the computer names it', async () => {
    const plan = planFor({ kind: 'move', to: phoneSlug(DEV, 'beta'), name: 'Beta' }, item(), NOW);
    expect(plan.steps).toEqual([{ door: 'moveItem', payload: { product: A, id: 'w-1', to: phoneSlug(DEV, 'beta') } }]);
    expect(plan.toast).toBe('Moved to Beta');
    const p = sender();
    await runSteps(p.sender, plan.steps);
    expect(p.rows().commands.at(-1).payload).toEqual({ scope: 'thread', key: 'moveTo', product: 'alpha', item: 'w-1', value: 'beta' });
  });
});

describe('Stop repeating', () => {
  const rules = [{ product: A, id: 'r-1', title: 'Daily report' }, { product: phoneSlug(DEV, 'beta'), id: 'r-2', title: 'Other' }];
  it('on a run of a repeating task the computer still keeps', () => {
    expect(ruleFor(item({ labels: ['founder', 'repeat:r-1'] }), rules)).toEqual({ product: A, id: 'r-1', title: 'Daily report' });
  });
  it('not on a thread that is no run, or whose task has ended or is another project\'s', () => {
    expect(ruleFor(item(), rules)).toBeNull();
    expect(ruleFor(item({ labels: ['repeat:r-9'] }), rules)).toBeNull();
    expect(ruleFor(item({ labels: ['repeat:r-2'] }), rules)).toBeNull();
  });
});

// A tester pressed Reopen with the computer off and read "Reopened" over a thread still closed.
describe('with the computer away and no cloud to carry it', () => {
  const away = { away: true };
  it('a change the computer makes says it waits for it', () => {
    expect(planFor({ kind: 'reopen' }, item({ status: 'done' }), NOW, away).toast).toBe('Reopens when your computer is back: Draw it');
    expect(planFor({ kind: 'restart' }, item(), NOW, away).toast).toBe('Up next once your computer is back.');
    expect(planFor({ kind: 'move', to: 'b', name: 'Beta' }, item(), NOW, away).toast).toBe('Moves to Beta when your computer is back');
    expect(planFor({ kind: 'keep-here', keep: true }, item(), NOW, away).toast).toBe('Runs only on your computer once it is back');
  });
  it('and says it is done while the computer is there', () => {
    expect(planFor({ kind: 'reopen' }, item({ status: 'done' }), NOW).toast).toBe('Reopened: Draw it');
    expect(planFor({ kind: 'move', to: 'b', name: 'Beta' }, item(), NOW).toast).toBe('Moved to Beta');
    expect(planFor({ kind: 'move', to: 'b', name: 'Beta' }, item(), NOW, { away: true, cloud: true }).toast).toBe('Moved to Beta');
  });
});

describe('the thread page and its menu', () => {
  const page = fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8');
  const menu = fs.readFileSync('mobile/src/ui/ThreadMenu.tsx', 'utf8');
  it('the page hands the menu each offer', () => {
    for (const wired of ['tryAgain={offers.tryAgain}', 'restart={offers.restart}', 'reopen={offers.reopen}', 'place={offers.place}',
      'priority={offers.priority ?', 'name={offers.rename ?', 'projects={offers.move ? moveChoices(', 'repeats={!!rule}']) expect(page).toContain(wired);
  });
  it('the menu says each in the desktop\'s words', () => {
    for (const words of ['"Try again"', '"Restart the agent (it stopped)"', '"Reopen"', '"Priority"', '"Rename"', '"Move to another project"', '"Stop repeating"']) {
      expect(menu).toContain(`label=${words}`);
    }
  });
  // A tester could not tell Reopen from Resume this agent (reopen and carry on) on a closed thread.
  it('Reopen says where the thread goes, so it reads apart from Resume', () => {
    expect(menu).toContain('label="Reopen" aside="Back in your inbox"');
  });
  // A tester typed " v1" after the name and the thread was renamed "v1": the whole name had been selected.
  it('Rename opens with the cursor after the name, not over it', () => {
    const field = menu.slice(menu.indexOf('<SheetHead>Rename</SheetHead>'), menu.indexOf("accessibilityLabel=\"The thread's name\""));
    expect(field).toContain('<TextInput value={naming}');
    expect(field).not.toContain('selectTextOnFocus');
  });
});

function sender() {
  const iso = (ms) => new Date(ms).toISOString();
  let rows = {
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }, { device: DEV, project: 'beta', name: 'Beta', updated_at: iso(NOW) }],
    threads: [{ device: DEV, project: 'alpha', item: 'w-1', updated_at: iso(NOW - 1000), snapshot: { v: 3, item: item({ product: undefined }), history: [] } }],
    commands: [],
  };
  let n = 0;
  const client = {
    generation: () => 0,
    async insertCommand(r) { n += 1; return { id: `c-${n}`, created_at: iso(NOW), claimed_at: null, taken_at: null, outcome: null, ...r }; },
    async update() { return []; },
  };
  return { sender: phoneSender({ client, rows: () => rows, setRows: (r) => { rows = r; }, aliases: () => ({}), changed: () => {} }), rows: () => rows };
}
