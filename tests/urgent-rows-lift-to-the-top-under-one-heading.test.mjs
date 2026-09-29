// URGENT LIFTS OUT OF THE RUNNING ORDER, UNDER ONE HEADING.
//
// w-bba20a03f5: higher-priority tasks were easy to miss in the list. Of five
// ways drawn to treat an urgent row, the pick was lifting urgent rows to the
// top under their own label.
//
// WHY A LIFT AND NOT A HIGHER SCORE, which is the part a later session will be
// tempted to simplify away. The inbox sorts by `byRunningOrder(score)`, and
// that score is the user's order over their PROJECTS: a place in it is worth a
// hundred item points (RANK_STEP, shared/rank.mjs), while an item's own
// priority runs 0..9. So an urgent row on the fifth project can never
// out-score an ordinary row on the first, whatever number is put on it. No amount of tuning the
// priority scale fixes that, because the two quantities are an order of
// magnitude apart on purpose. Lifting is the only move that does not require
// re-ranking a whole project to raise one row, which is the same reasoning
// `justImported` is lifted on (w-7a0ecc28de).
//
// AND WHY ONE HEADING. The inbox wears no date headings, as decided on
// w-abfe371152: one list, no date headings. This is not that. It appears at
// most once, it says something no row restates, and everything below it goes
// back to no heading at all. The test below pins exactly that shape, because a
// second heading creeping in underneath is how this turns back into the design
// that was turned down.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { dayGroups, List } from '../renderer/src/components/List';
import { PriorityIcon } from '../renderer/src/components/Priority';
import { REST_HEADING, URGENT_HEADING } from '../renderer/src/list-rules';
import { isUrgentRow } from '../renderer/src/interrupt';
import { isUrgent, itemPriority, RANK_STEP, productRankScore } from '../shared/rank.mjs';

const row = (id, priority, extra = {}) => ({
  id, priority, status: 'open', updatedAt: 1, title: id, ...extra,
});

// The label function List.tsx actually passes for the inbox, copied here in the
// one shape that matters: urgent gets the heading, everything else gets none.
const inboxLabel = (item) => (isUrgentRow(item) ? URGENT_HEADING : '');

describe('what counts as urgent', () => {
  it('is the one predicate in shared/rank.mjs, not a second copy', () => {
    const hers = row('a', 9);
    expect(isUrgentRow(hers)).toBe(true);
    expect(isUrgent(hers)).toBe(true);
    expect(isUrgentRow(row('b', 8))).toBe(false);
  });

  // The row drew its mark off `item.agent ? null : priority >= 9` until this
  // landed. That unmarked the user's urgent row the moment a worker claimed it, which
  // was survivable while the mark was decoration and is not survivable under a
  // heading: the row would sit beneath "Urgent" wearing nothing.
  it('stays urgent while a session is running on it', () => {
    const claimed = row('c', 9, { agent: { id: 'sess-1' } });
    expect(isUrgentRow(claimed)).toBe(true);
  });

  // The other half of the same rule, and the one that must not be lost:
  // an agent writing itself a nine buys nothing. Over a quarter of agent-filed
  // rows came in at 7 or higher before agents lost the number (w-b09b0c24cb).
  it('ignores a number an agent wrote for itself', () => {
    const agentTagged = row('d', 9, { wrote: { priority: { source: 'agent' } } });
    expect(itemPriority(agentTagged)).toBeLessThan(9);
    expect(isUrgentRow(agentTagged)).toBe(false);
  });
});

describe('the heading over the lifted rows', () => {
  it('draws once over the urgent block and nowhere else', () => {
    const items = [row('u1', 9), row('u2', 9), row('a', 5), row('b', 5)];
    const groups = dayGroups(items, inboxLabel);
    expect(groups.map((g) => g.label)).toEqual([URGENT_HEADING, '']);
    expect(groups[0].items.map(({ item }) => item.id)).toEqual(['u1', 'u2']);
  });

  // An empty label draws nothing at all in List.tsx (`{group.label && ...}`),
  // so a list with no urgent rows is exactly the headingless list it was before.
  it('leaves an inbox with nothing urgent completely unheaded', () => {
    const groups = dayGroups([row('a', 5), row('b', 2)], inboxLabel);
    expect(groups.map((g) => g.label)).toEqual(['']);
  });

  // THE SHAPE THAT MUST NOT APPEAR: heading, rows, heading. If App.tsx ever
  // stops lifting and leaves urgent rows scattered through the order, this is
  // what the list turns into, and it is w-abfe371152 all over again.
  it('never draws a second heading further down', () => {
    const scattered = [row('u1', 9), row('a', 5), row('u2', 9)];
    const torn = dayGroups(scattered, inboxLabel).map((g) => g.label);
    expect(torn).toEqual([URGENT_HEADING, '', URGENT_HEADING]);
    // Which is precisely why the lift happens before the list is drawn.
    const lifted = [...scattered.filter(isUrgentRow), ...scattered.filter((i) => !isUrgentRow(i))];
    expect(dayGroups(lifted, inboxLabel).map((g) => g.label)).toEqual([URGENT_HEADING, '']);
  });
});

// WHAT THE URGENT ROW ACTUALLY DRAWS, which is nothing. Of five marks drawn,
// none of which was an exclamation mark, option A was picked: no mark at all.
// This is a rendering test rather than a source one because
// both failures it guards are visual.
describe('the mark on an urgent row', () => {
  const draw = (items) => renderToStaticMarkup(createElement(List, {
    items, view: 'inbox', selected: 0, seen: new Set(), running: [],
    multiSel: new Set(), onSelect: () => {}, onOpen: () => {}, onToggle: () => {},
    onRange: () => {},
  }));
  const item = (id, priority) => ({
    id, status: 'open', updatedAt: Date.now(), priority,
    title: `row ${id}`, body: `row ${id}`, product: 'astral', productName: 'Agentbox',
    wrote: { priority: { ts: Date.now(), source: 'founder' } },
  });

  // THE HEADING HAS TO END. With the rows after it bare, one urgent row over
  // nineteen ordinary ones read as twenty urgent ones (w-ad426c52ae).
  it('labels the rows after the urgent block so Urgent visibly stops', () => {
    const html = draw([item('u', 9), item('a', 5), item('b', 5)]);
    const labels = [...html.matchAll(/class="day-label">([^<]*)</g)].map((m) => m[1]);
    expect(labels).toEqual([URGENT_HEADING, REST_HEADING]);
  });

  it('draws neither heading when nothing is urgent', () => {
    const html = draw([item('a', 5), item('b', 2)]);
    expect(html).not.toContain(URGENT_HEADING);
    expect(html).not.toContain(REST_HEADING);
  });

  // The alarm and import rows App.tsx lifts ABOVE the urgent block stay bare,
  // or the list would read heading, Urgent, heading.
  it('leaves rows above the urgent block unheaded', () => {
    const html = draw([item('top', 5), item('u', 9), item('a', 5)]);
    const labels = [...html.matchAll(/class="day-label">([^<]*)</g)].map((m) => m[1]);
    expect(labels).toEqual([URGENT_HEADING, REST_HEADING]);
    expect(html.indexOf('row top')).toBeLessThan(html.indexOf(URGENT_HEADING));
  });

  it('draws no mark of any kind, and no exclamation mark anywhere', () => {
    const html = draw([item('u', 9), item('a', 5)]);
    expect(html).toContain(URGENT_HEADING);
    expect(html).not.toContain('prio-usq');
    expect(html).not.toContain('>!<');
  });

  // THE FAILURE THAT WOULD LOOK FINE AND BE WRONG. Delete the urgent branch
  // instead of making it draw null and the row falls through to `>= 7`, so
  // urgent wears the three bars that mean HIGH. Urgent showing the same ink as
  // the level below it is the one answer worse than no mark.
  it('never falls through to the three bars that mean high priority', () => {
    expect(draw([item('u', 9)])).not.toContain('prio-bars');
    // While a genuinely high row still has them, so the test can fail.
    expect(draw([item('h', 7)])).toContain('prio-bars p3');
  });

  // THE DRAWER IS A DIFFERENT DECISION AND MUST NOT GO BLANK. There the icon is
  // a legend beside the word in a menu of four levels, and a blank where the
  // other three have a picture reads as a bug.
  it('still gives the priority drawer a picture, and it is four bars', () => {
    const urgent = renderToStaticMarkup(createElement(PriorityIcon, { id: 'urgent' }));
    expect(urgent).toContain('prio-bars p4');
    expect(urgent).not.toContain('prio-usq');
    expect(urgent.match(/<i>/g)).toHaveLength(4);
    // And high is still three, so the two are told apart by count.
    expect(renderToStaticMarkup(createElement(PriorityIcon, { id: 'high' })).match(/<i>/g)).toHaveLength(3);
  });
});

describe('why the score alone could never do this', () => {
  // The measurement behind the whole change, so nobody has to take it on
  // trust: the priority scale is dwarfed by the order over projects.
  it('cannot raise an urgent row above an ordinary one on a better project', () => {
    const order = ['astral', 'mithril', 'dawnling', 'elysian', 'personal'];
    const score = (i) => productRankScore(order, i.product) + itemPriority(i);
    const urgentOnTheLast = { ...row('u', 9), product: 'personal' };
    const ordinaryOnTheFirst = { ...row('o', 5), product: 'astral' };
    expect(score(ordinaryOnTheFirst)).toBeGreaterThan(score(urgentOnTheLast));
    // And the gap is a whole rank step wide, not a rounding error.
    expect(score(ordinaryOnTheFirst) - score(urgentOnTheLast)).toBeGreaterThan(RANK_STEP);
  });
});
