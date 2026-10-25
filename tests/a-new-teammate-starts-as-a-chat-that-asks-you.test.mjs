// "I wasn't a fan of the page for making teammates. I don't think the UX made
// a lot of sense and it didn't look super great. I didn't like the dropdowns."
// The page was a grid of starter cards to tick, two dropdowns (project,
// agent) and a box to describe your own, and a starter made a finished
// teammate that never asked you anything. Option B, approved: New teammate
// opens a chat where it asks what to take off your plate, the starters as
// answers to tap, or your own words. Either one makes a draft that keeps that
// greeting and your answer in its chat and asks you the rest before it starts.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { Teammates } from '../main/teammates.mjs';
import { GREETING, starterAsks, STARTERS } from '../shared/teammates.mjs';

const read = (f) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');

describe('what a new teammate offers to take on', () => {
  it('is each starter as a short ask, leaving out one already on your team', () => {
    expect(starterAsks([]).map((a) => a.ask)).toEqual(STARTERS.map((s) => s.ask));
    expect(starterAsks([]).find((a) => a.starter === 'support').ask).toBe('Answer user emails');
    const asks = starterAsks([{ starter: 'quality', name: 'Quality lead' }, { starter: null, name: 'Support lead' }]).map((a) => a.starter);
    expect(asks).not.toContain('quality');
    expect(asks).not.toContain('support');
    expect(asks).toContain('maintainer');
  });

  it('greets you in plain words with no colon', () => {
    expect(GREETING).toBe('Hi. What should I take off your plate? Pick one, or tell me in your own words.');
  });
});

describe('making one from the chat', () => {
  let team;
  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    const product = createProduct(`Shop ${Math.random().toString(36).slice(2, 8)}`);
    const dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    const mods = await loadStore();
    team = new Teammates({
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID }, modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    });
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  it('a tapped starter is a draft with its name and guesses, after the greeting and your answer', () => {
    const { teammate } = team.describe({ starter: 'support', greeted: true });
    expect(teammate).toMatchObject({ name: 'Support lead', role: 'Support lead', status: 'draft', starter: 'support' });
    const lines = team.chat().messages.filter((m) => m.kind === 'msg');
    expect(lines.map((m) => [m.from, m.text])).toEqual([[teammate.id, GREETING], ['you', 'Answer user emails']]);
    expect(lines[0].options).toContain('Answer user emails');
    expect(lines[1].setup).toBe(true);
    expect(lines[0].ts).toBeLessThan(lines[1].ts);
  });

  it('your own words are the answer, and the run that sets it up treats what it has as guesses', () => {
    const { teammate } = team.describe({ text: 'Someone to keep our docs current', greeted: true });
    expect(teammate.name).toBe('New teammate');
    const brief = team.briefFor({ id: 'w-s', labels: ['founder', `teammate:${teammate.id}`, 'hop:0'] });
    expect(brief).toMatch(/keep that name/);
    expect(brief).toMatch(/guesses to confirm, not settled/);
  });

  it('a starter whose name is taken leaves the naming to the teammate', () => {
    team.create({ name: 'Support lead', role: 'Support lead' });
    expect(team.describe({ starter: 'support', greeted: true }).teammate.name).toBe('New teammate');
  });

  it('a draft made from the New thread box has no greeting, as before', () => {
    const { teammate } = team.describe({ text: 'Someone for the changelog' });
    const lines = team.chat().messages.filter((m) => m.kind === 'msg');
    expect(lines.map((m) => m.from)).toEqual(['you']);
    expect(teammate.status).toBe('draft');
  });
});

describe('the page for a new teammate', () => {
  const page = read('teammates/TeammatesPage.tsx');
  const fn = (name) => page.slice(page.indexOf(`function ${name}(`), page.indexOf('\nfunction ', page.indexOf(`function ${name}(`) + 10));

  it('is a chat with the starters to tap and no dropdowns', () => {
    const made = fn('NewTeammate');
    expect(made).toMatch(/GREETING/);
    expect(made).toMatch(/starterAsks\(team\)/);
    expect(made).toMatch(/greeted: true/);
    expect(made).not.toMatch(/<select/);
    expect(page).not.toMatch(/function Starters\(|function StarterCard\(|function useWorkIn\(/);
  });

  // Option B's panel became the teammate's About on the Chats page (round 6):
  // a teammate still setting itself up says so there, and its job reads as
  // what it will do for you.
  it('a teammate still being set up says so, and its job reads as what it will do for you', () => {
    const about = fn('About');
    expect(about).toMatch(/It is still setting itself up, and asks you in the chat before it starts/);
    // A starter's job is written to the agent ("Ask the person before..."); its outcome is written to you.
    expect(about).toMatch(/t\.status === 'draft' \? jobLine\(t\) : t\.job/);
    expect(page).toMatch(/s && t\.job === s\.job \? s\.outcome/);
  });

  it('is what an empty team shows, and where New teammate goes, on every teammates page', () => {
    // An empty team, or New teammate, is the new teammate's chat; anything else opens a chat.
    expect(page).toMatch(/if \(open !== 'new' && team\.length\) return \{ kind: 'chat', id: team\[0\]\.id \};\n\s*return \{ kind: 'new' \};/);
    expect(page).toMatch(/if \(shown\.kind === 'new' \|\| !t\) main = <NewTeammate /);
    expect(page).toMatch(/\{open === 'new' \|\| !t\n?\s*\? <h1 className="workspace-title gc-head-group tq-title">/);
    const hook = read('teammates/useTeammates.tsx');
    expect(hook).toMatch(/open === 'new'/);
    expect(hook).toMatch(/onNew: \(\) => go\('new'\)/);
    expect(read('teammates/ChatsColumn.tsx')).toMatch(/aria-label="New teammate" title="New teammate" onClick=\{c\.onNew\}/);
    expect(read('components/Palette.tsx')).toMatch(/run: \(\) => onTeammates\('new'\)/);
  });
});
