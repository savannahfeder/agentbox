// WHAT THE SIDEBAR'S "Active agents" PANEL LISTS.
//
// She tested the shipped panel on 2026-08-20 and it said two.
//
// Measured on her machine at 12:17 that day, and this is what the panel was
// doing. The app was Electron pid 78378 with SIX claude workers as its children,
// every one of them on an Agentbox work item, and `listed` — the panel's only
// filter — is `!agent.startedByZero`, so all six were dropped. Seven more
// sessions were hers by hand, six with their cwd in ~/Desktop/dev/harbour and
// one in ~/Desktop/dev/zero, none of them in an Agentbox folder. The two rows
// left under the "the app" heading were two of those seven.
//
// Her answer on, told it draws fifteen rows on Agentbox against six: "Option 1:
// Everything not closed, on this product."
//
// So there are two populations and one heading, and the two tests that matter
// are that her tasks are counted by the three lists she named, and that a
// session the app started is NOT read out of the session list a second time.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { belongsOnTheRail } from '../renderer/src/list-rules';
import { onTheRail } from '../shared/agents.mjs';
import { NAME } from '../shared/product-name.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
const rail = fs.readFileSync(path.join(root, 'renderer/src/components/Rail.tsx'), 'utf8');

const NOW = 1_787_248_620_000;   // 2026-08-20 12:17, the moment above
const HOUR = 3_600_000;

const hers = (extra) => ({
  id: 'w-844cc74c14', status: 'open', kind: 'directive', labels: ['founder'],
  title: 'Active agents in the sidebar', updatedAt: NOW - HOUR, ...extra,
});
const on = (i, opts = {}) => belongsOnTheRail(i, { now: NOW, ...opts });

describe('her tasks: in progress, in her inbox, or scheduled', () => {
  it('counts a row a worker is on right now', () => {
    expect(on(hers({ status: 'claimed' }))).toBe(true);
  });

  it('counts her own task waiting its turn, which no session has claimed yet', () => {
    expect(on(hers())).toBe(true);
  });

  // THE HALF THE OLD PANEL COULD NEVER HAVE HELD. A question sitting in her
  // inbox is not a running process anywhere on the machine, and it is the one
  // she pointed at: "Something in the Inbox is still an active agent."
  it('counts a question waiting on her, with nothing running behind it', () => {
    expect(on({
      id: 'w-56e70ffd55', status: 'open', kind: 'question', labels: [],
      title: 'Say everything not closed, or say only the ones working', updatedAt: NOW - HOUR,
    })).toBe(true);
  });

  it('counts a row stopped and handed back to her', () => {
    expect(on(hers({ status: 'blocked' }))).toBe(true);
  });

  it('counts a row whose moment has not arrived, which is Scheduled', () => {
    expect(on(hers({ status: 'open', labels: [] }), { hiddenUntil: NOW + HOUR, deferredUntil: NOW + HOUR })).toBe(true);
  });

  // (2026-08-19 18:17).
  it('drops a finished row, which is the whole of what closed means here', () => {
    expect(on(hers({ status: 'done', labels: [] }))).toBe(false);
  });
});

describe('her own terminals, which have no work item to be counted by', () => {
  const session = (over = {}) => ({
    pid: 3487, name: 'session-46', cwd: '/Users/x/Desktop/dev/harbour',
    startedAt: NOW - HOUR, lastActiveAt: NOW - HOUR, startedByZero: false, ...over,
  });

  it('still lists a session she started herself', () => {
    expect(onTheRail(session(), NOW)).toBe(true);
  });

  // ONE ROW PER AGENT. A worker the app spawned is on a work item, and that item
  // is already counted by the rules above; reading the session as well would
  // print the same agent twice. This is why fixing the panel is NOT deleting
  // `listed` — the six hidden workers arrive as their rows, not as sessions.
  it(`never lists a session ${NAME} started, because its task is the row`, () => {
    expect(onTheRail(session({ startedByZero: true }), NOW)).toBe(false);
  });
});

describe('the panel is scoped to the product it is headed with', () => {
  // Both halves are filtered by the rail's own product in App.tsx, which is
  // where the rows are gathered.
  it('takes only this product’s tasks and this product’s sessions', () => {
    const rows = app.slice(app.indexOf('const railRows'), app.indexOf('const railRows') + 1400);
    expect(rows).toMatch(/i\.product === slug/);
    expect(rows).toMatch(/a\.product === slug/);
    expect(rows).toMatch(/belongsOnTheRail/);
    expect(rows).toMatch(/onTheRail\(a, now\)/);
  });

  it('draws whatever it is handed, so there is one place the rule lives', () => {
    expect(rail).not.toMatch(/startedByZero|belongsInInbox|RAIL_CUT_MS/);
  });
});
