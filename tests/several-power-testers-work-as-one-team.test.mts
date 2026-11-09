// SEVERAL POWER TESTERS WORK AS ONE TEAM.
//
// Asked on w-1fc102959f (2026-11-06): engineering teams leaving Conductor
// Cloud want multiplayer, and the founder asked for power users, several at
// once, to test it, sharing threads and files. The power test could only sign
// ONE tester in to a team (`--team`), so two testers were never on the same
// team. `--stand-in-team` puts every tester on one team through a stand-in
// team cloud: the first starts it, invites the rest, they accept, and the
// first shares a project. Pinned here: the order of those calls, that a team
// that does not form stops the run with the step that failed, and what each
// tester is told about who else is on it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formTeam, teamWords, teamEmail, writeTeamFiles } from '../.claude/skills/power-test/scripts/team.mjs';
import { readPeople, pickPeople } from '../.claude/skills/power-test/scripts/plan.mjs';

const people = pickPeople('startup-engineer,team-backend-engineer,team-product-engineer', readPeople(path.resolve('.claude/skills/power-test/people')));

/** A copy's door, played by a tiny team cloud: one team, invites by email. */
function fakeTeam({ neverInvited = null } = {}) {
  const cloud = { team: null, members: new Set(), invites: new Set(), shared: [] };
  const calls = [];
  const copy = (person, project = null) => ({
    person,
    project,
    call: async (channel, body = {}) => {
      calls.push(`${person.name.split(' ')[0]} ${channel}`);
      const me = teamEmail(person);
      if (channel === 'zero:team-create') { cloud.team = { id: 't1', name: body.name }; cloud.members.add(me); }
      if (channel === 'zero:team-invite' && body.email !== neverInvited) cloud.invites.add(body.email);
      if (channel === 'zero:team-accept-invite') {
        if (!cloud.invites.has(me)) throw new Error('that invite is no longer waiting');
        cloud.invites.delete(me); cloud.members.add(me);
      }
      if (channel === 'zero:team-share') cloud.shared.push(body.product);
      return { ok: true, team: { signedIn: true, team: cloud.members.has(me) ? cloud.team : null, invites: cloud.invites.has(me) ? [{ teamId: 't1' }] : [] } };
    },
  });
  return { cloud, calls, copy };
}

describe('a stand-in team for several testers', () => {
  it('is started by the first, joined by the rest on invitation, and has the first one\'s project shared', async () => {
    const { cloud, calls, copy } = fakeTeam();
    const made = await formTeam({ teamName: 'Clinic', copies: [copy(people[0], 'payments-api'), copy(people[1]), copy(people[2])], wait: async () => {} });
    expect(made).toEqual({ teamId: 't1', shared: 'payments-api' });
    expect([...cloud.members].sort()).toEqual(['lena@team.test', 'maya@team.test', 'theo@team.test']);
    expect(cloud.shared).toEqual(['payments-api']);
    expect(calls.indexOf('Maya zero:team-create')).toBeLessThan(calls.indexOf('Theo zero:team-accept-invite'));
  });

  it('stops with the person and the step when an invite never arrives', async () => {
    const { copy } = fakeTeam({ neverInvited: 'lena@team.test' });
    await expect(formTeam({ teamName: 'Clinic', copies: [copy(people[0]), copy(people[1]), copy(people[2])], wait: async () => {}, tries: 3 }))
      .rejects.toThrow(/Lena Fischer never saw the invite to Clinic/);
  });

  it('stops when a copy never signs in, before anything is made', async () => {
    const { calls, copy } = fakeTeam();
    const silent = { ...copy(people[1]), call: async () => ({ team: { signedIn: false } }) };
    await expect(formTeam({ teamName: 'Clinic', copies: [copy(people[0]), silent], wait: async () => {}, tries: 2 }))
      .rejects.toThrow(/Theo Okafor's copy never signed in/);
    expect(calls).not.toContain('Maya zero:team-create');
  });

  it('tells each tester who else is on the team, and not themselves', () => {
    const words = teamWords({ teamName: 'Clinic', me: people[1], people, shared: 'Payments API' });
    expect(words).toContain('Maya Chen');
    expect(words).toContain('Lena Fischer');
    expect(words).not.toContain('Theo Okafor');
    expect(words).toContain('Maya Chen shared the Payments API project');
    expect(teamWords({ teamName: 'Clinic', me: people[0], people, shared: 'Payments API' })).toContain('You shared the Payments API project');
  });

  it('writes each person a sign-in file for the stand-in cloud only they can read', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'team-files-'));
    const files = writeTeamFiles({ root, url: 'http://127.0.0.1:1', people });
    const theo = JSON.parse(fs.readFileSync(files['team-backend-engineer'], 'utf8'));
    expect(theo.email).toBe('theo@team.test');
    expect(JSON.parse(fs.readFileSync(theo.config, 'utf8'))).toMatchObject({ url: 'http://127.0.0.1:1', standin: true });
    expect(fs.statSync(files['team-backend-engineer']).mode & 0o077).toBe(0);
  });
});
