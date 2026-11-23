// INVITE PEOPLE WITH NO TEAM NEVER ASKS FOR A TEAM NAME (w-9687db6270, 2026-11-22).
//
// On the first multiplayer call a new owner pressed Invite people, which opens
// Settings › Team. With no team yet that page was "Start your team": one box
// whose only label was a faint "Team name" placeholder, under a sentence about
// inviting by email, with the person's own address shown twice. Their email
// went in as the team's name. A team made there was not Pro and could not
// invite, so it took a rename and then Start Pro. Now the page is the Team
// page's own start: your face, two open seats and Pro, which makes and names
// the team. Measured by rendering the page as a person with no team.
//
// A synthetic first-day user then pressed Invite people and found "Bring your
// team in" with no invite box and nothing saying why (power test, 2026-11-22),
// so here the start is headed with the words a team without Pro already reads.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeamPage } from '../renderer/src/team/TeamPage.tsx';
import { NOT_LET_IN } from '../renderer/src/team/ask-for-multiplayer.tsx';
import { PRO_FOR_INVITES } from '../renderer/src/team/multiplayer-words.ts';
import type { TeamState } from '../renderer/src/types.ts';

globalThis.React = React;
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const me = { id: 'p-dana', name: 'Dana Whitfield', email: 'dana@example.test' };
const state = (over: Partial<TeamState>) => ({ configured: true, signedIn: true, me, team: null, invites: [], people: [], cards: [], multiplayer: true, ...over }) as unknown as TeamState;
const page = (over: Partial<TeamState>) => renderToStaticMarkup(React.createElement(TeamPage, { team: state(over), inviteFocus: true }));

describe('Settings › Team with no team', () => {
  it('says inviting comes with Pro and offers it, which makes the team, and no box to name it', () => {
    const html = page({});
    expect(text(html)).toContain(`${PRO_FOR_INVITES} Try Pro free for 7 days`);
    expect(html).not.toMatch(/<input/);
    expect(text(html)).not.toMatch(/Team name|Start team|Start your team/);
  });
  it('still tells someone waiting for an invite which address to give', () => {
    expect(text(page({}))).toContain('Ask a teammate to invite dana@example.test');
  });
  it('asks someone already invited to join, and offers no Pro', () => {
    const t = text(page({ invites: [{ teamId: 't-1', teamName: 'Northwind', invitedBy: 'p-sam', invitedByName: 'Sam Ortiz' }] }));
    expect(t).toContain('Sam invited you to Northwind. Join?');
    expect(t).not.toContain(PRO_FOR_INVITES);
  });
  it('asks to be let in when multiplayer is not open to them yet', () => {
    const t = text(page({ multiplayer: false }));
    expect(t).toContain(NOT_LET_IN);
    expect(t).not.toContain('Try Pro free');
  });
});

describe('Settings › Team with a team', () => {
  it('keeps the team’s name under its own label, where it is renamed', () => {
    const html = page({ team: { id: 't-1', name: 'Northwind' }, people: [{ ...me, role: 'owner' }] as unknown as TeamState['people'], pro: true } as Partial<TeamState>);
    expect(text(html)).toContain('Team name');
    expect(html).toMatch(/aria-label="Team name"/);
  });
});

describe('the page’s code', () => {
  it('no longer makes a team from a name typed here', () => {
    expect(fs.readFileSync(new URL('../renderer/src/team/TeamPage.tsx', import.meta.url), 'utf8')).not.toContain('api.teamCreate');
  });
});
