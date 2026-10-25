// THE TEAM PAGE FROM A PHONE, straight to the account with no computer between.
// The database decides who may rename, remove and cancel
// (20261001000600_team_settings.sql), as it does for the Mac
// (main/team/supabase-backend.mjs), so these only ask.
import type { cloudClient } from './cloud-rest';

type Rest = Pick<ReturnType<typeof cloudClient>, 'session' | 'select' | 'insert' | 'remove' | 'rpc'>;
export interface TeamPerson { id: string; email: string | null; name: string | null; role: 'owner' | 'member' }
export interface PhoneTeam { id: string; name: string; people: TeamPerson[]; invited: string[]; mine: 'owner' | 'member' }
export interface TeamInvite { teamId: string; teamName: string; invitedBy: string | null }

const inList = (ids: string[]) => `in.(${ids.map(encodeURIComponent).join(',')})`;
const me = (c: Rest) => {
  const id = c.session()?.user.id;
  if (!id) throw new Error('not signed in');
  return id;
};
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Your team, or the invites waiting for you when you are on none. */
export async function readTeam(c: Rest): Promise<{ team: PhoneTeam | null; invites: TeamInvite[] }> {
  const self = me(c);
  const ids = (await c.select('team_members', `select=team_id&person_id=eq.${self}`)).map((m: any) => m.team_id);
  if (!ids.length) {
    const rows = (await c.rpc('pending_invites')) ?? [];
    return { team: null, invites: rows.map((r: any) => ({ teamId: r.team_id, teamName: r.team_name, invitedBy: r.invited_by_name ?? null })) };
  }
  const [t] = await c.select('teams', `select=id,name&id=${inList(ids)}&order=created_at&limit=1`);
  if (!t) return { team: null, invites: [] };
  const members = await c.select('team_members', `select=person_id,role&team_id=eq.${t.id}`);
  const roles = new Map<string, string>(members.map((m: any) => [m.person_id, m.role]));
  const people = members.length ? await c.select('people', `select=id,email,name&id=${inList([...roles.keys()])}`) : [];
  const invited = (await c.select('team_invites', `select=email&team_id=eq.${t.id}`)).map((i: any) => String(i.email));
  const role = (id: string): TeamPerson['role'] => (roles.get(id) === 'owner' ? 'owner' : 'member');
  return {
    team: {
      id: t.id,
      name: t.name,
      people: people.map((p: any) => ({ id: p.id, email: p.email ?? null, name: p.name ?? null, role: role(p.id) }))
        .sort((a: TeamPerson, b: TeamPerson) => (a.role === b.role ? String(a.email).localeCompare(String(b.email)) : a.role === 'owner' ? -1 : 1)),
      invited,
      mine: role(self),
    },
    invites: [],
  };
}

export async function inviteTo(c: Rest, teamId: string, email: string) {
  const clean = email.trim();
  if (!EMAIL.test(clean)) throw new Error('That is not an email address.');
  await c.insert('team_invites', { team_id: teamId, email: clean, invited_by: me(c) }, 'team_id,email');
}

export async function cancelInvite(c: Rest, teamId: string, email: string) {
  await c.remove('team_invites', `team_id=eq.${teamId}&email=eq.${encodeURIComponent(email)}`);
}

/** Somebody out of the team; yourself is leaving it. */
export async function removeFromTeam(c: Rest, teamId: string, personId: string) {
  const gone = await c.remove('team_members', `team_id=eq.${teamId}&person_id=eq.${personId}`);
  if (!gone.length) throw new Error('Only the team’s owner can remove somebody.');
}

export async function joinTeam(c: Rest, teamId: string) {
  await c.rpc('accept_invite', { p_team: teamId });
}
