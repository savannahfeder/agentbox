// AN URGENT THREAD THAT ARRIVES IS ANNOUNCED, NOT OPENED (w-f18ede1965).
//
// "urgent tasks interrupting my work are annoying. i'd rather have some sort of
// notification telling me the task is ready, giving me the OPTION to switch to
// it." An urgent thread arriving in Needs you swapped itself in for the thread
// open on screen (App.tsx set `focused` to it) and drew a "Back to …" bar.
// Measured by reading the effect and photographing the sample app with
// &arrives: the open thread was replaced. Now the arrival is named in the top
// bar with O to open it, and the thread on screen stays.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { urgentArrival, urgentRaised, urgentShown, isUrgentRow } from '../renderer/src/urgent-arrival.ts';
import { UrgentReady } from '../renderer/src/components/UrgentReady.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const NOW = 1_787_600_000_000;

const row = (id: string, priority: number, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'directive', title: `row ${id}`,
  priority, createdAt: NOW, updatedAt: NOW, ...extra,
}) as never;

const ask = (over: object) => urgentArrival({
  reading: null, inbox: [], known: new Set(), spent: new Set(), ...over,
});

describe('which arrival is announced', () => {
  it('an urgent thread that arrives while another thread is open', () => {
    const urgent = row('w-urgent', 9);
    expect(ask({ reading: row('w-medium', 5), inbox: [urgent] })).toBe(urgent);
  });

  // Nothing is taken away any more, so an urgent thread open is no reason to stay quiet.
  it('while another urgent thread is open', () => {
    const urgent = row('w-urgent', 9);
    expect(ask({ reading: row('w-reading', 9), inbox: [urgent] })).toBe(urgent);
  });

  it('not with no thread open, where the list already shows it at the top', () => {
    expect(ask({ reading: null, inbox: [row('w-urgent', 9)] })).toBeNull();
  });

  it('not for a thread that was already in the inbox', () => {
    expect(ask({ reading: row('w-medium', 5), inbox: [row('w-urgent', 9)], known: new Set(['w-urgent']) })).toBeNull();
  });

  it('not for a High one', () => {
    expect(ask({ reading: row('w-medium', 5), inbox: [row('w-high', 7)] })).toBeNull();
  });

  it('not twice for the same thread', () => {
    expect(ask({ reading: row('w-medium', 5), inbox: [row('w-urgent', 9)], spent: new Set(['w-urgent']) })).toBeNull();
  });

  it('not for the thread that is open', () => {
    expect(ask({ reading: row('w-same', 5), inbox: [row('w-same', 9)] })).toBeNull();
  });

  it('an agent’s nine and the compose box’s nine, not an agent’s seven', () => {
    const agentNine = row('w-agent', 9, { wrote: { priority: { ts: NOW, source: 'agent' } } });
    const hers = row('w-hers', 9, { wrote: { priority: { ts: NOW, source: 'system' } } });
    const agentSeven = row('w-agent-high', 7, { wrote: { priority: { ts: NOW, source: 'agent' } } });
    expect(ask({ reading: row('w-medium', 5), inbox: [agentNine] })).toBe(agentNine);
    expect(ask({ reading: row('w-medium', 5), inbox: [hers] })).toBe(hers);
    expect(ask({ reading: row('w-medium', 5), inbox: [agentSeven] })).toBeNull();
  });

  it('the first of two that arrive together, in inbox order', () => {
    const first = row('w-first', 9);
    expect(ask({ reading: row('w-medium', 5), inbox: [first, row('w-second', 9)] })).toBe(first);
  });
});

// The first version raised the routine corner note, which fades in six seconds
// and "looks just like a processed task note which i've learned to ignore". It
// now has its own mark in the top bar that stays until it is dealt with.
describe('how long the top bar names it', () => {
  const urgent = row('w-urgent', 9);
  const reading = row('w-medium', 5);
  const raised = urgentRaised(urgent, reading);

  it('while the thread it arrived over is open and it still waits', () => {
    expect(urgentShown(raised, reading, [urgent])).toBe(urgent);
  });

  it('the current copy of the row, not the one it arrived as', () => {
    const newer = { ...(urgent as object), title: 'renamed' } as never;
    expect(urgentShown(raised, reading, [newer])).toBe(newer);
  });

  it('not once another thread is open', () => {
    expect(urgentShown(raised, row('w-other', 5), [urgent])).toBeNull();
  });

  it('not with no thread open', () => {
    expect(urgentShown(raised, null, [urgent])).toBeNull();
  });

  it('not once it has left the inbox', () => {
    expect(urgentShown(raised, reading, [])).toBeNull();
  });

  it('not for the same id in another project', () => {
    expect(urgentShown(raised, { ...(reading as object), product: 'elsewhere' } as never, [urgent])).toBeNull();
  });

  it('nothing when nothing arrived', () => {
    expect(urgentShown(null, reading, [urgent])).toBeNull();
  });
});

describe('the mark in the top bar', () => {
  const html = renderToStaticMarkup(createElement(UrgentReady, { row: row('w-urgent', 9, { title: 'Sign-in is down' }), onOpen: () => {} }));

  it('is one button with the title and the O key', () => {
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('Sign-in is down');
    expect(html).toContain('>O</kbd>');
  });

  it('has no timer and is not the routine note', () => {
    expect(html).not.toContain('toast');
  });

  // "i like this but it does not indicate that it's urgent": the word goes
  // before the name, in the accent.
  it('says Urgent before the title', () => {
    expect(html.indexOf('>Urgent<')).toBeGreaterThan(-1);
    expect(html.indexOf('>Urgent<')).toBeLessThan(html.indexOf('Sign-in is down'));
    expect(read('renderer/src/styles.css')).toMatch(/\.ur-word \{[^}]*color: var\(--chip-ask\)/);
  });

  // "no need for the hover to see more info. not needed anymore now that you
  // have the title". And only the approved look ships, with no switch.
  it('has no hover card and only the approved look', () => {
    expect(html).not.toContain('tooltip');
    expect(read('renderer/src/styles.css')).not.toMatch(/\.ur-(card|bell|[a-g])\b/);
    expect(read('renderer/src/App.tsx')).not.toContain('urgentlook');
  });
});

describe('the takeover is gone', () => {
  it('nothing opens an urgent thread over the one on screen', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).not.toContain('heldByUrgent');
    expect(app).not.toContain('taskToReturnTo');
    expect(fs.existsSync(path.join(root, 'renderer/src/interrupt.ts'))).toBe(false);
  });

  it('the Back to bar and its styles are deleted', () => {
    expect(fs.existsSync(path.join(root, 'renderer/src/components/UrgentBar.tsx'))).toBe(false);
    expect(read('renderer/src/components/Focus.tsx')).not.toContain('interruptedFrom');
    for (const gone of ['.urgent-bar', '.urgent-return', '.urgent-word']) {
      expect(read('renderer/src/styles.css'), gone).not.toContain(gone);
    }
  });
});

describe('what counts as urgent', () => {
  it('is a nine and nothing below it', () => {
    expect(isUrgentRow(row('a', 9))).toBe(true);
    expect(isUrgentRow(row('a', 7))).toBe(false);
    expect(isUrgentRow(null)).toBe(false);
  });
});
