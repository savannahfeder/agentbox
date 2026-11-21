// THE DEMO COPY'S TEAM, HELD INSIDE THE COPY ITSELF.
//
// A demo has to show teammates without signing in to the team cloud as a real
// person, and without a server anybody could point an installed app at. So a
// demo copy keeps an in-memory team cloud (main/team/memory-cloud.mts, the same
// rules as the hosted database) and signs in to it as the invented person.
// Every teammate's words are written through that cloud's own calls, as their
// copies would write them.
//
// It is made again each time the copy starts, from the moment the store was
// seeded (`seededAt`), so a restarted demo tells the same morning.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TeamBackend, TeamSession } from './team/index.mts';
import type { MemoryCloud } from './team/memory-cloud.mts';
import {
  type DemoPerson, yesterdayAt, DEMO_CHATS, DEMO_GROUP_POSTS, DEMO_ME, DEMO_PRODUCTS, DEMO_TEAM, DEMO_TEAM_LOOK, DEMO_TEAMMATES, demoCards, demoMessages, withFile,
} from '../shared/demo-world.mts';
import { TEAM_LOOK, TEAM_LOOK_POSTED } from '../shared/team-look.mts';

const HR = 3_600_000;

/** Where the moment a demo was seeded is kept, in its throwaway home. */
export const SEEDED_FILE = '.demo-seeded.json';

export function writeSeededAt(home: string, now: number) {
  fs.writeFileSync(path.join(home, SEEDED_FILE), `${JSON.stringify({ seededAt: now })}\n`);
}

export function readSeededAt(home: string): number {
  try {
    const at = JSON.parse(fs.readFileSync(path.join(home, SEEDED_FILE), 'utf8')).seededAt;
    return Number.isFinite(at) ? at : Date.now();
  } catch { return Date.now(); }
}

/** A person's photo, inside the address itself, so it draws with no network. */
export function faceOf(p: DemoPerson): string | null {
  try {
    const bytes = fs.readFileSync(new URL(`../shared/demo-faces/${p.face}`, import.meta.url));
    return `data:image/jpeg;base64,${bytes.toString('base64')}`;
  } catch { return null; }
}

/** The team, its people, its shared projects and everything the teammates said. */
export async function seedDemoTeam(now: number): Promise<MemoryCloud> {
  const { createMemoryCloud, memoryBackend, signUpMemory } = await import('./team/memory-cloud.mts');
  const cloud = createMemoryCloud();
  for (const p of [DEMO_ME, ...DEMO_TEAMMATES]) signUpMemory(cloud, { id: p.id, email: p.email, name: p.name, avatarUrl: faceOf(p) });
  cloud.teamsMade = 1;
  cloud.teams.set(DEMO_TEAM.id, { id: DEMO_TEAM.id, name: DEMO_TEAM.name, createdBy: DEMO_ME.id, made: 1 });
  cloud.members.push({ teamId: DEMO_TEAM.id, personId: DEMO_ME.id, role: 'owner' });
  for (const p of DEMO_TEAMMATES) cloud.members.push({ teamId: DEMO_TEAM.id, personId: p.id, role: 'member' });

  const me = memoryBackend(cloud, DEMO_ME.id);
  for (const p of DEMO_PRODUCTS) await me.shareProject({ id: p.projectId, teamId: DEMO_TEAM.id, name: p.name });
  for (const p of [DEMO_ME, ...DEMO_TEAMMATES]) await memoryBackend(cloud, p.id).saveRoomProfile({ display_name: p.name, headline: p.job, avatar_url: faceOf(p) });

  // The cloud stamps each line with its own clock, which the inbox shows as
  // the line's time, so the clock is set to when each was said.
  let clock = now;
  cloud.now = () => clock;
  let uid = 0;
  const line = (by: string, ts: number, source: string, patch: Record<string, unknown>, rowId: string) => ({ id: rowId, ts, source, by, uid: `demo-${++uid}`, patch });
  for (const m of demoMessages(now)) {
    clock = m.at;
    const them = memoryBackend(cloud, m.from.id);
    const people = [m.from.id, DEMO_ME.id];
    await them.shareProject({ id: m.projectId, teamId: DEMO_TEAM.id, name: 'Direct', visibility: 'people', people, direct: true });
    if (m.file) await them.putFile(m.projectId, m.file.path, Buffer.from(`${m.file.text}\n`).toString('base64'));
    await them.pushLines(m.projectId, [
      // A task's mark rides the line that opens it, or the pull drops it (shared/team-rules.mts).
      line(m.from.id, m.at, 'system', { title: m.title, kind: 'directive', priority: 0, status: 'open', ...(m.given ? { labels: ['given-task'] } : m.subject ? { labels: ['work-thread'] } : {}) }, m.id),
      line(m.from.id, m.at + 1, 'founder', { title: m.title, body: withFile(m), assignee: DEMO_ME.id, people }, m.id),
    ]);
    // Sorted already, as the copy's own agent would have sorted it.
    await me.pushLines(m.projectId, [line(DEMO_ME.id, m.at + 2, 'agent', { priority: m.priority }, m.id)]);
  }

  // A chat with one teammate is a group of the two of you, named for the
  // other person, as the app makes one (main/team/rooms.mts `create`).
  for (const c of DEMO_CHATS) {
    clock = yesterdayAt(now, c.said[0].at);
    const room = await memoryBackend(cloud, c.with.id).createRoom({ name: DEMO_ME.name, kind: 'group', people: [DEMO_ME.id] }) as string;
    for (const s of c.said) {
      clock = yesterdayAt(now, s.at);
      await memoryBackend(cloud, s.by === 'me' ? DEMO_ME.id : c.with.id).sendRoomMessage(room, { body: s.text });
    }
  }

  for (const person of DEMO_TEAMMATES) {
    const cards = demoCards(now).filter((c) => c.by.id === person.id).map((c) => ({
      threadId: c.threadId, visible: true, title: c.title, project: c.project, people: null, state: c.state,
      priority: null, problem: null, progress: c.progress ?? null, solution: null, blockedBy: [], blocks: [],
      updatedAt: c.updatedAt, ...(c.shippedAt ? { shippedAt: c.shippedAt } : {}),
    }));
    await memoryBackend(cloud, person.id).putCards(DEMO_TEAM.id, cards);
  }
  // The team's group: the Team look, filled in, then the morning's posts. A
  // group with a Team look already in it is not given the blank one.
  const priya = memoryBackend(cloud, DEMO_TEAMMATES[0].id);
  const group = ((await priya.myRooms()) as { id: string; teamId: string | null }[]).find((r) => r.teamId === DEMO_TEAM.id);
  if (group) {
    clock = now - 26 * HR;
    await priya.putRoomFile(group.id, TEAM_LOOK, Buffer.from(DEMO_TEAM_LOOK).toString('base64'));
    await priya.sendRoomMessage(group.id, { body: TEAM_LOOK_POSTED });
    for (const post of DEMO_GROUP_POSTS) {
      clock = now - post.hoursAgo * HR;
      await memoryBackend(cloud, post.by.id).sendRoomMessage(group.id, { body: post.body });
    }
  }
  cloud.now = () => Date.now();
  await keepTeammatesWorking(cloud);
  return cloud;
}

/** Each teammate's computer says what its agents are on. Presence goes stale
 *  after a quarter of an hour, so a demo copy says it again every five
 *  minutes for as long as it is open. */
async function keepTeammatesWorking(cloud: MemoryCloud) {
  const { memoryBackend } = await import('./team/memory-cloud.mts');
  const say = async () => {
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    for (const [n, p] of DEMO_TEAMMATES.entries()) {
      const running = demoCards(now).filter((c) => c.by.id === p.id && c.state === 'running');
      await memoryBackend(cloud, p.id).putPresence(`d${String(n).padStart(11, '0')}`, {
        agents_running: running.length ? running.length + n : 0,
        working_on: running[0]?.title.slice(0, 64) ?? null,
        working_at: new Date(now - (n + 1) * 7 * 60_000).toISOString(),
        day, hours_today: 2.5 + n, active_days: [day],
      });
    }
  };
  await say();
  setInterval(() => { void say().catch(() => {}); }, 5 * 60_000).unref?.();
}

/**
 * The session a demo copy signs in with: always signed in, as the invented
 *  person, to the team above. There is nothing to sign in or out of. */
export function demoTeamSession({ home = os.homedir() }: { home?: string } = {}): TeamSession {
  let signedIn: Promise<TeamBackend> | null = null;
  const backend = () => {
    signedIn ??= seedDemoTeam(readSeededAt(home)).then(async (cloud) => {
      const { memoryBackend } = await import('./team/memory-cloud.mts');
      return memoryBackend(cloud, DEMO_ME.id) as unknown as TeamBackend;
    });
    return signedIn;
  };
  return {
    configured: true,
    restore: backend,
    signIn: backend,
    signInWithPassword: backend,
    cancelSignIn: () => {},
    reopen: () => {},
    async signOut() {},
    async anyone() { return null; },
  };
}
