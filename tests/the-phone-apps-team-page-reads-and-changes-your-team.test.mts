// THE PHONE APP'S TEAM PAGE READS AND CHANGES YOUR TEAM, WITH NO COMPUTER ON.
//
// The phone app had no Team page, and the phone website's draws nothing once
// you are signed in: its `team()` answers null (renderer/src/cloud-bridge.ts),
// because the desktop's page asks the Mac. The team lives in the account, so
// the phone asks the account directly, the same tables the Mac reads
// (main/team/supabase-backend.mjs myTeams, teamPeople, listInvites, invite,
// cancelInvite, removeMember, acceptInvite). The database's own rules decide
// who may do what; a removal the rules turned down comes back empty and says so.
import { describe, it, expect } from 'vitest';
import { cloudClient } from '../renderer/src/cloud-rest';
import { readTeam, inviteTo, cancelInvite, removeFromTeam, joinTeam } from '../renderer/src/phone-team';

const ME = 'p-me';
const session = { access_token: 't', refresh_token: 'r', expires_at: Date.now() + 3600_000, user: { id: ME, email: 'me@example.com' } };
const store = () => { const m = new Map([['agentbox-cloud-session', JSON.stringify(session)]]); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

function cloud(answers) {
  const asked = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method ?? 'GET'} ${u.pathname.replace('/rest/v1/', '')}`;
    asked.push({ key, query: decodeURIComponent(u.search), body: init.body ? JSON.parse(init.body) : null });
    const a = answers[key];
    const body = typeof a === 'function' ? a(u) : a ?? [];
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { asked, c: cloudClient({ url: 'https://cloud.example', anonKey: 'k' }, { storage: store(), fetchImpl }) };
}

describe('reading your team', () => {
  it('names the team, its people owner first, the invites waiting, and whether you own it', async () => {
    const { c } = cloud({
      'GET team_members': (u) => (u.search.includes('person_id=eq') ? [{ team_id: 't-1' }] : [{ person_id: ME, role: 'member' }, { person_id: 'p-2', role: 'owner' }, { person_id: 'p-3', role: 'member' }]),
      'GET teams': [{ id: 't-1', name: 'Astral' }],
      'GET people': [{ id: ME, email: 'me@example.com', name: 'Me' }, { id: 'p-2', email: 'zed@example.com', name: 'Zed' }, { id: 'p-3', email: 'amy@example.com', name: null }],
      'GET team_invites': [{ email: 'new@example.com' }],
    });
    const { team, invites } = await readTeam(c);
    expect(invites).toEqual([]);
    expect(team.name).toBe('Astral');
    expect(team.mine).toBe('member');
    expect(team.people.map((p) => [p.email, p.role])).toEqual([['zed@example.com', 'owner'], ['amy@example.com', 'member'], ['me@example.com', 'member']]);
    expect(team.invited).toEqual(['new@example.com']);
  });

  it('on no team, the invites waiting for you', async () => {
    const { c, asked } = cloud({
      'GET team_members': [],
      'POST rpc/pending_invites': [{ team_id: 't-9', team_name: 'Kestrel', invited_by_name: 'Zed' }],
    });
    expect(await readTeam(c)).toEqual({ team: null, invites: [{ teamId: 't-9', teamName: 'Kestrel', invitedBy: 'Zed' }] });
    expect(asked.map((a) => a.key)).toEqual(['GET team_members', 'POST rpc/pending_invites']);
  });
});

describe('changing it', () => {
  it('invites by email, once, in your name', async () => {
    const { c, asked } = cloud({});
    await inviteTo(c, 't-1', '  new@example.com ');
    expect(asked[0]).toMatchObject({ key: 'POST team_invites', query: '?on_conflict=team_id,email', body: { team_id: 't-1', email: 'new@example.com', invited_by: ME } });
  });

  it('refuses something that is not an email, and asks nothing', async () => {
    const { c, asked } = cloud({});
    await expect(inviteTo(c, 't-1', 'amy')).rejects.toThrow('That is not an email address.');
    await expect(inviteTo(c, 't-1', 'amy@example')).rejects.toThrow();
    expect(asked).toEqual([]);
  });

  it('cancels one invite and removes one person', async () => {
    const { c, asked } = cloud({ 'DELETE team_members': [{ person_id: 'p-3' }] });
    await cancelInvite(c, 't-1', 'new+tag@example.com');
    await removeFromTeam(c, 't-1', 'p-3');
    expect(asked.map((a) => [a.key, a.query])).toEqual([
      ['DELETE team_invites', '?team_id=eq.t-1&email=eq.new+tag@example.com'],
      ['DELETE team_members', '?team_id=eq.t-1&person_id=eq.p-3'],
    ]);
  });

  it('says so when the rules removed nobody', async () => {
    const { c } = cloud({ 'DELETE team_members': [] });
    await expect(removeFromTeam(c, 't-1', 'p-2')).rejects.toThrow('Only the team’s owner can remove somebody.');
  });

  it('joins through the invite, as the Mac does', async () => {
    const { c, asked } = cloud({});
    await joinTeam(c, 't-9');
    expect(asked[0]).toMatchObject({ key: 'POST rpc/accept_invite', body: { p_team: 't-9' } });
  });
});
