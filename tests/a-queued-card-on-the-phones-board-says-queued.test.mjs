// A QUEUED CARD ON THE PHONE'S BOARD SAYS QUEUED.
//
// The 2026-11-06 phone workday (issues 11, 15, 20): with the computer offline
// 15 minutes, Everything else's board read IN PROGRESS 7, and four of those had
// never started. Their cards looked the same as the ones really running. The
// phone's list rows already say Queued, and the desktop's board cards say it in
// the running mark's place (Pages.tsx, `saysOnCard`); the phone's board cards
// drew only the running mark, so a queued card said nothing.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneView } from '../renderer/src/phone-rows';
import { madeHere } from '../shared/phone-snapshot.mjs';
import { DEFAULT_DISPLAY } from '../renderer/src/threads/page-rules';
import { phoneBoard, phoneTabs } from '../mobile/src/lib/tabs';

const NOW = Date.parse('2026-11-06T18:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const DEV = 'a1b2c3d4e5f6';
const NEW_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const thread = (item, extra = {}, more = {}) => ({ device: DEV, project: 'alpha', item, updated_at: iso(NOW - 1000), snapshot: { v: 2, item: { id: item, title: `T ${item}`, kind: 'directive', labels: ['founder'], status: 'claimed', updatedAt: NOW - 1e5, createdAt: NOW - 2e5, ...extra }, history: [], ...more } });
const sent = (payload) => ({ id: NEW_ID, device: DEV, project: 'alpha', item: null, kind: 'new', payload, created_at: iso(NOW - 1000), taken_at: null, outcome: null });

function board(threads, commands = []) {
  const view = phoneView({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW - 1000) }], threads, commands }, NOW);
  const tabs = phoneTabs(view, NOW);
  return phoneBoard(view, tabs, { ...DEFAULT_DISPLAY.inbox, view: 'board' }, NOW);
}
const card = (cols, id) => cols.flatMap((c) => c.rows.map((r) => ({ ...r, column: c.state }))).find((r) => r.item?.id === id);

describe('the board on the phone', () => {
  it('a thread sent from the phone and not yet taken is Queued in In progress', () => {
    const c = card(board([], [sent({ title: 'Ship it', body: '' })]), madeHere(NEW_ID));
    expect(c.column).toBe('running');
    expect(c.queued).toBe(true);
  });
  it('a thread the computer says waits its turn is Queued', () => {
    const c = card(board([thread('w-q', { status: 'open' }, { wait: { state: 'queued' } })]), 'w-q');
    expect(c.column).toBe('running');
    expect(c.queued).toBe(true);
  });
  it('a thread an agent is on is not Queued', () => {
    const c = card(board([thread('w-live', {}, { live: { since: NOW - 60_000, at: NOW, where: 'mac', doing: [] } })]), 'w-live');
    expect(c.column).toBe('running');
    expect(c.live).toBe(true);
    expect(c.queued).toBe(false);
  });
  it('a thread sent for later is not Queued in Later', () => {
    const c = card(board([], [sent({ title: 'Notes', body: '', runAt: NOW + 3 * 86400_000 })]), madeHere(NEW_ID));
    expect(c.column).toBe('scheduled');
    expect(c.queued).toBe(false);
  });
  it('the card draws the word where the running mark would be', () => {
    expect(fs.readFileSync('mobile/src/app/index.tsx', 'utf8')).toMatch(/e\.queued \? <T[^>]*>Queued<\/T> : e\.live && /);
  });
});
