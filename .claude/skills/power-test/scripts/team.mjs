// SEVERAL TESTERS ON ONE TEAM (`--stand-in-team`): each copy signs in to a
// stand-in team cloud of the run's own as its own person, then the first one
// starts the team, invites the rest and shares a project, the way a lead
// would on the first morning. Everything goes through each copy's own door
// (POST /api/<channel>, main/serve.mts), so it is the app doing it, not us.
import fs from 'node:fs';
import path from 'node:path';

/** An address on the stand-in team, from the person's first name. */
export const teamEmail = (person) => `${person.name.split(' ')[0].toLowerCase()}@team.test`;

/** The file live.mjs `--team` reads, one per person, beside their evidence. */
/** `site`: where shared links open (main/file-link.mts linkSiteFor); none, and Share is not offered. */
export function writeTeamFiles({ root, url, people, site = null }) {
  const dir = path.join(root, 'team-cloud');
  fs.mkdirSync(dir, { recursive: true });
  const config = path.join(dir, 'team.config.json');
  fs.writeFileSync(config, JSON.stringify({ url, anonKey: 'stand-in', standin: true, ...(site ? { phoneSite: site } : {}) }));
  const files = {};
  for (const p of people) {
    const file = path.join(root, p.slug, 'team.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ config, email: teamEmail(p), password: 'stand-in' }), { mode: 0o600 });
    files[p.slug] = file;
  }
  return files;
}

/** Each person known to the stand-in cloud by their full name before their copy signs in. */
export async function namePeople({ url, people, fetchImpl = fetch }) {
  for (const p of people) {
    const res = await fetchImpl(`${url}/signin`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: teamEmail(p), password: 'stand-in', name: p.name }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`the stand-in team cloud would not take ${p.name}: ${res.status}`);
  }
}

/** A copy's door, from the address live.mjs wrote into its state. */
export function doorOf(state, fetchImpl = fetch) {
  const at = new URL(state.url);
  const token = at.searchParams.get('token');
  return async (channel, body = {}) => {
    const res = await fetchImpl(`${at.origin}/api/${encodeURIComponent(channel)}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-agentbox-token': token },
      body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out?.ok === false) throw new Error(`${channel}: ${out?.error ?? res.status}`);
    return out;
  };
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `copies` is [{ person, call, project }], the lead first. Returns what was
 * made, or throws with the step that failed: a team that did not form is a
 * run with nothing to test, so it stops before any tester starts.
 */
export async function formTeam({ teamName, copies, wait = pause, tries = 30 }) {
  const [lead, ...rest] = copies;
  const signedIn = async (c) => {
    for (let i = 0; i < tries; i++) {
      const { team } = await c.call('zero:team-sync').catch(() => ({ team: null }));
      if (team?.signedIn) return team;
      await wait(1000);
    }
    throw new Error(`${c.person.name}'s copy never signed in to the team cloud`);
  };
  for (const c of copies) await signedIn(c);
  const made = (await lead.call('zero:team-create', { name: teamName })).team?.team;
  if (!made?.id) throw new Error(`${lead.person.name} could not start ${teamName}`);
  for (const c of rest) await lead.call('zero:team-invite', { email: teamEmail(c.person) });
  for (const c of rest) {
    let invited = false;
    for (let i = 0; i < tries && !invited; i++) {
      const { team } = await c.call('zero:team-sync');
      invited = (team?.invites ?? []).some((v) => v.teamId === made.id);
      if (!invited) await wait(1000);
    }
    if (!invited) throw new Error(`${c.person.name} never saw the invite to ${teamName}`);
    await c.call('zero:team-accept-invite', { teamId: made.id });
  }
  if (lead.project) await lead.call('zero:team-share', { product: lead.project });
  for (const c of copies) await c.call('zero:team-sync').catch(() => {});
  return { teamId: made.id, shared: lead.project ?? null };
}

/** What a tester is told about the team they are on. */
export function teamWords({ teamName, me, people, shared }) {
  const others = people.filter((p) => p.slug !== me.slug);
  return `YOUR TEAM
You are on ${teamName} in Agentbox with ${others.map((p) => `${p.name} (${p.role})`).join(' and ')}. They are using it right now, on their own computers, at the same time as you. Your team moved off Conductor Cloud this week, which shuts down in days, and you are trying Agentbox to see whether the whole team can work in it together.${shared ? ` ${people[0].slug === me.slug ? 'You' : people[0].name} shared the ${shared} project with the team this morning.` : ''}
Work with them the way your team does: hand a thread to a teammate, open and read a teammate's thread, ask about or comment on their work, pick up where a teammate left off, send them files your agents made (a design, a table, a page, a document) and open the ones they send you. Message them when you need something and answer when they write. When something you did should have reached a teammate, check that it did, and when they say they sent you something, go and find it.`;
}
