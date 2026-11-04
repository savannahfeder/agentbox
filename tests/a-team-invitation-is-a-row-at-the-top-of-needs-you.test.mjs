// A TEAM INVITATION IS A ROW AT THE TOP OF NEEDS YOU.
//
// Someone invited to Lumen sat on an inbox reading "Nothing needs
// you" and found the invite only in Settings > Team. The inbox is the one place you live, so an invitation
// has to arrive there, count in the total, and be answerable from the keyboard.
// Group invitations reached no screen at all.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { inviteRows } from '../renderer/src/threads/needs-you-rows.ts';
import { InviteRows } from '../renderer/src/threads/InviteRows.tsx';
import { listStops, stepStop, stopKey, leadStops } from '../renderer/src/threads/walk-rules.ts';

const team = { teamId: 't-1', teamName: 'Lumen', invitedByName: 'Maya Costa' };
const group = { roomId: 'r-1', roomName: 'Design', invitedBy: 'p-sofia', invitedByName: 'Sofia' };

describe('the rows', () => {
  it('say who invited you to what, by first name', () => {
    expect(inviteRows([team], [])).toEqual([{ key: 'invite/team/t-1', kind: 'team', id: 't-1', words: 'Maya invited you to Lumen' }]);
  });
  it('still read with no name', () => {
    expect(inviteRows([{ ...team, invitedByName: null }], [])[0].words).toBe('You are invited to Lumen');
  });
  it('include group invitations, under the team ones', () => {
    expect(inviteRows([team], [group]).map((r) => r.words)).toEqual(['Maya invited you to Lumen', 'Sofia invited you to Design']);
    expect(inviteRows([], [group])[0]).toMatchObject({ key: 'invite/group/r-1', kind: 'group', id: 'r-1' });
  });
  it('are nothing when nothing is waiting', () => {
    expect(inviteRows(undefined, undefined)).toEqual([]);
  });
});

const draw = (rows, over = {}) => renderToStaticMarkup(React.createElement(InviteRows, { rows, onJoin: () => {}, onOpen: () => {}, selected: null, ...over }));

describe('the row on screen', () => {
  const html = draw(inviteRows([team], []));
  it('says it, with a Join button', () => {
    expect(html).toContain('Maya invited you to Lumen');
    expect(html).toMatch(/<button[^>]*>Join<\/button>/);
  });
  it('says what it is waiting for in the Status column', () => {
    expect(html).toMatch(/class="th-cell-state"[^>]*>.*Waiting on you/);
  });
  it('wears the keyboard when it is on it', () => {
    expect(draw(inviteRows([team], []), { selected: 'invite/team/t-1' })).toMatch(/class="row rm-mention unread selected"/);
    expect(html).not.toMatch(/selected/);
  });
});

describe('the keys reach it', () => {
  const lead = [{ lead: { key: 'invite/team/t-1' } }, { lead: { key: 'room-mention:r' } }];
  const item = { id: 'w-1', product: 'p' };
  const stops = [...leadStops(lead.map((l) => l.lead)), ...listStops([item], null)];
  it('J from the top row goes on to the next, then into the threads', () => {
    expect(stopKey(stepStop(stops, stops[0], 1))).toBe('lead/room-mention:r');
    expect(stepStop(stops, stops[1], 1).item).toBe(item);
  });
  it('K from the first thread goes up onto the rows above it', () => {
    expect(stepStop(stops, { item }, -1).lead.key).toBe('room-mention:r');
  });
  it('off the top, nothing', () => { expect(stepStop(stops, stops[0], -1)).toBeNull(); });
});

describe('in the app', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('counts them in the total, wherever Needs you is counted', () => {
    expect(app).not.toMatch(/roomsUi\.mentions\.length/);
    expect(app.match(/leadCount/g)?.length).toBeGreaterThanOrEqual(5);
  });
  it('does not say the inbox is clear while one waits', () => {
    expect(app).toMatch(/emptyView && !theirRows\.length && !\(view === 'inbox' && search === null && \(leadCount \|\| sharedFileNews\.length \|\| followingNews\.length\)\)/);
  });
  it('Enter on the row answers it', () => {
    expect(app).toMatch(/case 'Enter':[^\n]*keyLead/);
  });
  it('a click elsewhere on a team invitation opens Settings > Team', () => {
    const open = app.slice(app.indexOf('const openInvite ='), app.indexOf('const openInvite =') + 300);
    expect(open).toContain("setSettingsPane('team')");
  });
  it('a click on Join does not also open the row', () => {
    const src = fs.readFileSync(new URL('../renderer/src/threads/InviteRows.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/e\.stopPropagation\(\);\s*onJoin/);
  });
});
