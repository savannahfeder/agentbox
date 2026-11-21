// The demo copy is what is on a shared screen during an onboarding call, so
// its team side has to look real (teammates, a shared project, their
// messages, a standup) without signing in to the team cloud as a real person
// (asked for 2026-11-21). Before this, a demo copy run from a checkout read
// the checkout's own team key and opened on the real team's sign-in page.
// Measured in the browser copy: signed in as the invented person, six things
// waiting on them, three teammates on the Team page.

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEMO_CLOUD, loadCloudConfig, supabaseSession } from '../main/team/session.mts';
import { readSeededAt, seedDemoTeam, writeSeededAt } from '../main/demo-team.mts';
import {
  DEMO_CHATS, LENA_THREAD, SUBJECT_TASK, yesterdayAt, DEMO_ENV, DEMO_GROUP_POSTS, DEMO_ME, DEMO_PRODUCTS, DEMO_TEAM, DEMO_TEAM_LOOK, DEMO_TEAMMATES, demoCards, demoLedgerLines, demoMessages, lastWorkingMorning,
} from '../shared/demo-world.mts';
import { TEAM_LOOK } from '../shared/team-look.mts';

const made: string[] = [];
const dir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-team-')); made.push(d); return d; };
afterEach(() => { while (made.length) fs.rmSync(made.pop()!, { recursive: true, force: true }); });

const realKey = (at: string) => {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, JSON.stringify({ url: 'https://real-team.example', anonKey: 'real' }));
};

describe('which team a demo copy reads', () => {
  it('is its own, even beside a checkout and a computer that hold a real key', () => {
    const appDir = dir();
    const home = dir();
    realKey(path.join(appDir, 'cloud', 'team.config.json'));
    realKey(path.join(home, '.agentbox', 'team.config.json'));
    const env = { [DEMO_ENV]: '1', AGENTBOX_TEAM_CONFIG: path.join(appDir, 'cloud', 'team.config.json') };
    expect(loadCloudConfig(appDir, { packaged: false, home, env })).toEqual(DEMO_CLOUD);
  });

  it('and in an installed copy too', () => {
    expect(loadCloudConfig(dir(), { packaged: true, home: dir(), env: { [DEMO_ENV]: '1' } })).toEqual(DEMO_CLOUD);
  });

  it('while a copy that is not a demo still reads the real key', () => {
    const appDir = dir();
    realKey(path.join(appDir, 'cloud', 'team.config.json'));
    expect(loadCloudConfig(appDir, { packaged: false, home: dir(), env: {} })?.url).toBe('https://real-team.example');
  });
});

describe('the team a demo copy is signed in to', () => {
  const signedIn = async () => {
    const backend = await supabaseSession({ cloudConfig: DEMO_CLOUD, sessionFile: path.join(dir(), 's'), openExternal: () => {}, packaged: true }).restore();
    return backend as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  };

  it('signs in at once as the invented person, with nothing to type', async () => {
    const b = await signedIn();
    expect(await b.me()).toMatchObject({ id: DEMO_ME.id, name: DEMO_ME.name });
    expect(await b.myTeam()).toEqual(DEMO_TEAM);
  });

  it('has three teammates beside them', async () => {
    const people = await (await signedIn()).teamPeople(DEMO_TEAM.id) as { name: string }[];
    expect(people.map((p) => p.name).sort()).toEqual([DEMO_ME, ...DEMO_TEAMMATES].map((p) => p.name).sort());
  });

  it('shares every invented project, and a conversation with each teammate who wrote', async () => {
    const projects = await (await signedIn()).listProjects() as { id: string; direct?: boolean }[];
    for (const p of DEMO_PRODUCTS) expect(projects.map((x) => x.id)).toContain(p.projectId);
    expect(projects.filter((p) => p.direct)).toHaveLength(demoMessages().length);
  });

  it('holds each teammate message for this person, dated when it was said and already sorted', async () => {
    const now = Date.now();
    const b = await signedIn();
    for (const m of demoMessages(now)) {
      const lines = await b.pullLines(m.projectId) as { line: { patch: Record<string, unknown>; at?: number; ts: number } }[];
      const said = lines.find((l) => l.line.patch.body);
      expect(said?.line.patch.assignee).toBe(DEMO_ME.id);
      expect(Math.abs(said!.line.ts - m.at)).toBeLessThan(60_000);
      expect(lines.some((l) => typeof l.line.patch.priority === 'number' && l.line.patch.priority > 0)).toBe(true);
    }
  });

  it('carries each message\'s file, so it opens from the message', async () => {
    const b = await signedIn();
    for (const m of demoMessages().filter((x) => x.file)) {
      expect(await b.hasFiles(m.projectId, [m.file!.path])).toEqual([m.file!.path]);
      const lines = await b.pullLines(m.projectId) as { line: { patch: Record<string, unknown> } }[];
      expect(lines.some((l) => String(l.line.patch.body ?? '').includes(`](attachments/${m.file!.path})`))).toBe(true);
    }
  });

  it('has the team\'s group with a filled-in Team look and the morning\'s posts', async () => {
    const b = await signedIn();
    const group = (await b.myRooms() as { id: string; teamId: string | null }[]).find((r) => r.teamId === DEMO_TEAM.id)!;
    const said = await b.roomMessages(group.id) as { body: string; person_id?: string; by?: string }[];
    expect(said.some((m) => m.body.includes(TEAM_LOOK))).toBe(true);
    expect(said.filter((m) => !m.body.includes(TEAM_LOOK))).toHaveLength(DEMO_GROUP_POSTS.length);
    const look = Buffer.from(String(await b.roomFile(group.id, TEAM_LOOK)), 'base64').toString('utf8');
    expect(look).toBe(DEMO_TEAM_LOOK);
    expect(look).not.toMatch(/^- \w+:\s*$/m);
  });

  // "Give the teammates real pictures. Make sure they've shipped more" (2026-11-21).
  it('gives every person a photo, not two letters', async () => {
    const people = await (await signedIn()).teamPeople(DEMO_TEAM.id) as { name: string; avatarUrl: string | null }[];
    expect(people).toHaveLength(4);
    for (const p of people) expect(p.avatarUrl, p.name).toMatch(/^data:image\/jpeg;base64,\/9j\//);
  });

  it('has a chat of two with each teammate, so their page never opens on an empty one', async () => {
    const b = await signedIn();
    const rooms = await b.myRooms() as { id: string; kind: string; members: number }[];
    for (const p of DEMO_TEAMMATES) {
      let found = false;
      for (const r of rooms.filter((x) => x.kind === 'group' && x.members === 2)) {
        if ((await b.roomPeople(r.id) as string[]).includes(p.id)) {
          found = true;
          expect((await b.roomMessages(r.id) as unknown[]).length, p.name).toBeGreaterThan(0);
        }
      }
      expect(found, p.name).toBe(true);
    }
  });

  // The call script's beats (2026-11-21): Tasks, late and blocked first, and an
  // agent @-mentioned in a chat beside people.
  it('gives the Tasks page one late task, one blocked on you and more ahead', async () => {
    const now = Date.now();
    const cards = (await (await signedIn()).listCards() as { task?: { dueAt: number }; blockedBy: { id: string }[] }[]).filter((c) => c.task);
    expect(cards.some((c) => c.task!.dueAt < now)).toBe(true);
    expect(cards.some((c) => c.blockedBy.some((b) => b.id === `person:${DEMO_ME.id}`))).toBe(true);
    expect(cards.filter((c) => c.task!.dueAt > now && !c.blockedBy.length).length).toBeGreaterThan(0);
  });

  it('brings an agent into Lena\'s thread the way the reply box does, answered and finished', async () => {
    const lena = demoMessages().find((m) => m.id === LENA_THREAD.id)!;
    const lines = await (await signedIn()).pullLines(lena.projectId) as { line: { by?: string; patch: Record<string, unknown> } }[];
    const ask = lines.find((l) => String(l.line.patch.answer ?? '').includes('agentbox-agent:'));
    expect(String(ask?.line.patch.answer)).toContain(`[@Claude Code in Website](agentbox-agent:claude?project=website&task=${SUBJECT_TASK})`);
    // Lena has the last word, so the thread still waits on you.
    expect(lines.at(-1)?.line.patch.assignee).toBe(DEMO_ME.id);
    const task = demoLedgerLines().website.filter((l) => l.id === SUBJECT_TASK);
    expect(task.some((l) => (l.patch.labels as string[] | undefined)?.includes(`asked-in:${LENA_THREAD.slug}/${LENA_THREAD.id}`))).toBe(true);
    expect(task.some((l) => String(l.patch.result ?? '').length > 40)).toBe(true);
    expect(task.some((l) => l.patch.status === 'done')).toBe(true);
  });

  it('shows what each teammate is on', async () => {
    const cards = await (await signedIn()).listCards() as { personId: string; state: string }[];
    for (const p of DEMO_TEAMMATES) expect(cards.some((c) => c.personId === p.id)).toBe(true);
    expect(cards.some((c) => c.state === 'running')).toBe(true);
    expect(cards.some((c) => c.state === 'done')).toBe(true);
  });

  it('is the same team on every start, so a restarted demo tells the same morning', async () => {
    const home = dir();
    writeSeededAt(home, 1_800_000_000_000);
    expect(readSeededAt(home)).toBe(1_800_000_000_000);
    const a = await seedDemoTeam(1_800_000_000_000);
    const b = await seedDemoTeam(1_800_000_000_000);
    expect([...a.cards.keys()].sort()).toEqual([...b.cards.keys()].sort());
    expect(a.lines.map((l) => l.uid)).toEqual(b.lines.map((l) => l.uid));
  });
});

describe('what waits on the person when it opens', () => {
  it('is six: two teammates and four agents', () => {
    const lines = Object.values(demoLedgerLines()).flat();
    const finished = new Set(lines.filter((l) => l.patch.status === 'done').map((l) => l.id));
    const theirs = new Set(lines.map((l) => l.id).filter((id) => !finished.has(id)));
    expect(theirs.size + demoMessages().length).toBe(6);
  });

  it('includes a thread that belongs with a teammate, by name', () => {
    const lines = Object.values(demoLedgerLines()).flat();
    expect(lines.some((l) => DEMO_TEAMMATES.some((p) => String(l.patch.result ?? '').includes(`\n1. Hand it to ${p.name.split(' ')[0]} (recommended)`)))).toBe(true);
  });
});

describe('finished work lands inside the standup that opens', () => {
  const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).getTime();

  it('on a weekday it is dated back from now', () => {
    expect(lastWorkingMorning(at(2026, 11, 18, 15))).toBe(at(2026, 11, 18, 15));
  });

  it('on a Saturday or a Sunday, from Friday before its 9:00 standup', () => {
    const friday = new Date(2026, 10, 20, 8, 30).getTime();
    expect(lastWorkingMorning(at(2026, 11, 21, 7))).toBe(friday);
    expect(lastWorkingMorning(at(2026, 11, 22, 20))).toBe(friday);
  });

  it('and every teammate has shipped at least three things in it, on a weekday or a weekend', () => {
    for (const now of [at(2026, 11, 18, 15), at(2026, 11, 21, 7)]) {
      const morning = lastWorkingMorning(now);
      for (const p of DEMO_TEAMMATES) {
        const shipped = demoCards(now).filter((c) => c.by.id === p.id && c.shippedAt && c.shippedAt < morning && c.shippedAt > morning - 24 * 3_600_000);
        expect(shipped.length, p.name).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('and every chat line was said in working hours the day before, whenever the demo opens', () => {
    // A Priya message stamped 12:08am was counted back from a demo opened at 18:00.
    for (const now of [at(2026, 11, 18, 9), at(2026, 11, 18, 18), at(2026, 11, 21, 23)]) {
      for (const c of DEMO_CHATS) for (const s of c.said) {
        const when = new Date(yesterdayAt(now, s.at));
        expect(when.getHours()).toBeGreaterThanOrEqual(9);
        expect(when.getHours()).toBeLessThan(18);
        expect(when.getTime()).toBeLessThan(now);
      }
    }
  });

  it('so every finished card on a Saturday falls between Thursday 9:00 and Friday 9:00', () => {
    const from = new Date(2026, 10, 19, 9).getTime();
    const to = new Date(2026, 10, 20, 9).getTime();
    for (const c of demoCards(at(2026, 11, 21, 7)).filter((x) => x.state === 'done')) {
      expect(c.updatedAt).toBeGreaterThan(from);
      expect(c.updatedAt).toBeLessThan(to);
    }
  });
});
