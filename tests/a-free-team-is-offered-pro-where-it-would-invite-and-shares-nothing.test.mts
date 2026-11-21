// A FREE TEAM IS OFFERED PRO WHERE IT WOULD INVITE, AND SHARES NOTHING
// (w-61142123a4, 2026-11-21).
//
// The founder: making a team, inviting people and sharing on the Free plan "is
// a bug. That's supposed to be a paid feature." Measured on main at c30873df:
// Settings › Team drew the invite box for a team that had never paid, and a
// thread marked Team went up to the teammate's copy within one sync. The
// database now refuses both (tests/team-features-need-pro-or-a-card-trial);
// this is the app's half: it asks whether the team pays, sends no thread up
// while it does not, and offers Pro where the invite box was.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { TeamPage } from '../renderer/src/team/TeamPage.tsx';
import { readTeam } from '../renderer/src/phone-team.ts';
import { proButton, PRO_PITCH } from '../renderer/src/setup-split.ts';
import { PRO_FOR_INVITES } from '../renderer/src/team/multiplayer-words.ts';

type Answer = (() => Promise<boolean>) | null;

async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string, pays: () => Answer) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'free-team-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  // No answer at sign-in is a cloud without the question.
  const backend = () => { const b = memoryBackend(cloud, personId); return pays() ? { ...b, teamPays: () => (pays() ?? (async () => true))() } : b; };
  const service = createTeamService({
    session: memorySession(backend),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  return { personId, store, service, storeRoot };
}

let cloud: ReturnType<typeof createMemoryCloud>;
let maya: Awaited<ReturnType<typeof aMac>>;
let theo: Awaited<ReturnType<typeof aMac>>;
let answer: Answer;
beforeEach(async () => {
  disk._internals.forgetFolds();
  answer = async () => true;
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }), () => answer);
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }), () => answer);
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('theo@nw.test');
  await theo.service.signIn();
  await theo.service.acceptInvite(maya.service.state().team!.id);
  disk.setLineAuthor(maya.personId);
});
afterEach(async () => {
  for (const m of [maya, theo]) {
    await m.service.signOut();
    fs.rmSync(m.storeRoot, { recursive: true, force: true });
  }
});

const bothSync = async () => { await maya.service.syncNow(); await theo.service.syncNow(); };
const theoSees = (id: string) => theo.service.threadWork(maya.personId, id).shared;
const cardsOf = (personId: string) => [...cloud.cards.values()].filter((c: { personId: string }) => c.personId === personId);

describe('what the window is told', () => {
  it('is false when the cloud says the team has no Pro, and true once it starts, at the next sync', async () => {
    answer = async () => false;
    await maya.service.syncNow();
    expect(maya.service.state().pro).toBe(false);
    answer = async () => true;
    await maya.service.syncNow();
    expect(maya.service.state().pro).toBe(true);
  });

  it('says nothing either way when the cloud cannot answer, so an older cloud hides nothing', async () => {
    answer = async () => { throw new Error('function my_team_pays does not exist'); };
    await maya.service.syncNow();
    expect(maya.service.state().pro).toBeNull();
    answer = null;
    await maya.service.signOut();
    await maya.service.signIn();
    expect(maya.service.state().pro).toBeNull();
  });
});

describe('a team without Pro', () => {
  it('sends a Team thread nowhere', async () => {
    answer = async () => false;
    const item = maya.store.composeItem('website', { title: 'Checkout is slow', visibility: 'team' });
    await bothSync();
    expect(cardsOf(maya.personId)).toEqual([]);
    expect(theoSees(item.id)).toBe(false);
  });

  it('takes back what it shared while it paid, and shares it again once it pays', async () => {
    const item = maya.store.composeItem('website', { title: 'Checkout is slow', visibility: 'team' });
    await bothSync();
    expect(theoSees(item.id)).toBe(true);
    answer = async () => false;
    await bothSync();
    expect(theoSees(item.id)).toBe(false);
    answer = async () => true;
    await bothSync();
    expect(theoSees(item.id)).toBe(true);
  });
});

describe('Settings › Team', () => {
  const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const page = (state: ReturnType<typeof maya.service.state>) => renderToStaticMarkup(React.createElement(TeamPage, { team: { ...state, configured: true } as never }));

  it('offers the owner Pro where the invite box was', async () => {
    answer = async () => false;
    await maya.service.syncNow();
    const html = page(maya.service.state());
    expect(text(html)).toContain(PRO_FOR_INVITES);
    expect(html).not.toContain('Their email');
  });

  it('tells someone else on the team to ask its owner', async () => {
    answer = async () => false;
    await theo.service.syncNow();
    const t = text(page(theo.service.state()));
    expect(t).toContain('Inviting people comes with Pro. Ask Maya to start it.');
    expect(t).not.toContain('Try Pro');
  });

  it('keeps the invite box while the team pays, and when the cloud could not say', async () => {
    await maya.service.syncNow();
    expect(page(maya.service.state())).toContain('Their email');
    expect(page({ ...maya.service.state(), pro: null })).toContain('Their email');
  });
});

describe('the Pro button', () => {
  it('promises the free days the cloud says the team has, and none before it has said', () => {
    expect(proButton(false, null)).toBe(PRO_PITCH.cta);
    expect(proButton(true, { signedIn: true, teamFreeDays: 7 })).toBe('Try Pro free for 7 days');
    expect(proButton(true, { signedIn: true, teamFreeDays: 4 })).toBe('Try Pro free for 4 days');
    expect(proButton(true, { signedIn: true, teamFreeDays: 0 })).toBe('Start Pro now');
    expect(proButton(true, { signedIn: false })).toBe('Start Pro');
    expect(proButton(true, null)).toBe('Start Pro');
  });
});

// So several copies on one machine can be a team that starts on Free (power-test --share-stage).
describe('the stand-in team cloud with teams on Free', () => {
  it('refuses an invite until its pay door says the team pays, and stops again when it says not', async () => {
    const { startStandinCloud } = await import('../cloud/standin/server.mjs');
    const { standinSession } = await import('../main/team/standin-backend.mts');
    const up = await startStandinCloud({ freeTeams: true });
    try {
      const sam = await standinSession({ cloudConfig: { url: up.url }, testLogin: 'sam@lumen.test:x' }).restore();
      const team = await sam.createTeam('Lumen');
      expect(await sam.teamPays()).toBe(false);
      await expect(sam.invite(team.id, 'dev@lumen.test')).rejects.toThrow(/Inviting teammates needs Pro/);
      const pay = (pays: boolean) => fetch(`${up.url}/pay`, { method: 'POST', body: JSON.stringify({ team: 'sam@lumen.test', pays }) }).then((r) => r.json());
      expect(await pay(true)).toEqual({ team: team.id, pays: true });
      expect(await sam.teamPays()).toBe(true);
      await sam.invite(team.id, 'dev@lumen.test');
      await pay(false);
      const dev = await standinSession({ cloudConfig: { url: up.url }, testLogin: 'dev@lumen.test:x' }).restore();
      await expect(dev.acceptInvite(team.id)).rejects.toThrow(/needs Pro to take anyone new/);
    } finally { await up.stop(); }
  });
});

describe('the phone', () => {
  const rest = (pays: unknown) => ({
    session: () => ({ user: { id: 'me' } }),
    rpc: async (name: string) => { if (name === 'my_team_pays') { if (pays instanceof Error) throw pays; return pays; } return []; },
    select: async (table: string) => (table === 'team_members' ? [{ team_id: 't1', person_id: 'me', role: 'owner' }] : table === 'teams' ? [{ id: 't1', name: 'Northwind' }] : []),
  });
  it('reads whether the team pays, and nothing when the cloud cannot say', async () => {
    expect((await readTeam(rest(false) as never)).pro).toBe(false);
    expect((await readTeam(rest(true) as never)).pro).toBe(true);
    expect((await readTeam(rest(new Error('no such function')) as never)).pro).toBeNull();
  });
});
