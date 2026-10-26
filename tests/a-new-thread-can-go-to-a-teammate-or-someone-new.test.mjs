// New thread's To offers your teammates and Someone new (w-4bd7b5548b, the
// "Give a task to someone new" entry point approved in round 3). A task to a
// teammate goes into the team chat to it; to Someone new it makes a teammate
// from the task, which sets itself up and then does the task as its first job.
// Also pinned: Make a teammate opens the new one's chat. It never did, because
// the store hands the teammate back nested and the page read `id` off the top.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Teammates } from '../main/teammates.mjs';
import { loadStore } from '../main/store-modules.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('To in New thread', () => {
  const card = read('renderer/src/threads/ThreadComposer.tsx');
  const app = read('renderer/src/App.tsx');

  it('lists each started teammate and Someone new, and sends to them without making a thread', () => {
    expect(card).toMatch(/<span className="tc-menu-head">Teammates<\/span>/);
    expect(card).toMatch(/Someone new/);
    expect(card).toMatch(/if \(mate\) \{ void sendToTeammate\(\); return; \}/);
    // Only started ones: a teammate still being set up has no job to give work to.
    expect(app).toMatch(/agentMates=\{teammatesUi\.live \? snap\.teammates\?\.list\.filter\(\(t\) => t\.status === 'active'\) : undefined\}/);
  });

  // A send to a teammate leaves you where you were, as any send does; only
  // someone new opens, since it asks you its first questions (last power test).
  it('posts to a teammate, describes Someone new in the project picked, and opens only someone new', () => {
    expect(app).toMatch(/to === 'new' \? 'describe' : 'post', to === 'new' \? \{ text, \.\.\.\(product \? \{ product \} : \{\}\) \} : \{ text, to: \[to\], fresh: true \}/);
    expect(app).toMatch(/if \(to === 'new'\) teammatesUi\.go\(r\.value\?\.teammate\?\.id \?\? 'team'\);/);
  });

  it('Make a teammate opens the new teammate from where the store puts it', () => {
    expect(read('renderer/src/teammates/TeammatesPage.tsx')).toMatch(/\(made as \{ teammate\?: \{ id\?: unknown \} \}\)\?\.teammate\?\.id/);
  });
});

describe('someone new, made from a task', () => {
  it('is briefed to treat a task as its first job once it is set up', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-tm-new-'));
    const mods = await loadStore();
    const team = new Teammates({ config: { storeRoot: root, accountId: 'acct-new' }, modules: mods, listProducts: () => [{ slug: 'p', dir: root, name: 'P', repoPath: '/r' }], listItems: () => [] });
    const { teammate } = team.describe({ text: 'Write the launch post for Friday' });
    const brief = team.briefFor({ id: 'w-x', product: 'p', labels: ['founder', `teammate:${teammate.id}`, 'hop:0'] });
    expect(brief).toMatch(/also your first job/);
    // A started teammate is not told to set itself up.
    team.start(teammate.id);
    expect(team.get(teammate.id).status).toBe('active');
    const later = team.briefFor({ id: 'w-y', product: 'p', labels: ['founder', `teammate:${teammate.id}`, 'hop:0'] });
    expect(later).not.toMatch(/also your first job/);
  });
});

// The second power test pressed Start on a card and got a teammate on the
// default agent in a project it never chose. Start and Make a teammate take
// the project and the agent picked above them.
describe('starting one from the Teammates page', () => {
  const page = read('renderer/src/teammates/TeammatesPage.tsx');
  // Option B (w-4bd7b5548b) made the page a chat: a tapped starter and your
  // own words both go through one call, in the project picked beside it. The
  // agent it runs on is chosen in its settings, with its model and effort.
  it('makes it in the project picked, from a tapped starter or your own words', () => {
    expect(page).toMatch(/call\('describe', \{ \.\.\.args, greeted: true, product: where\.slug \}\)/);
    expect(page).toMatch(/onClick=\{\(\) => \{ void make\(\{ starter: a\.starter \}\); \}\}/);
    expect(page).toMatch(/onSend=\{\(text\) => make\(\{ text \}\)\}/);
    // The agent is picked in its About now, beside the model (round 6).
    expect(page).toMatch(/<dt>Runs on<\/dt>/);
  });
  it('says when it works, and on which agent, beside its goal', () => {
    expect(page).toMatch(/`Works \$\{t\.worksLabel\}` : 'Works when someone writes to it'/);
  });
});

// "No save button visible, so I can't tell if edits here are saved at all"
// (third power test). Each kept change says Saved for a moment.
describe('the About editor', () => {
  it('says Saved after a change lands', () => {
    const page = read('renderer/src/teammates/TeammatesPage.tsx');
    expect(page).toMatch(/\.then\(\(ok\) => \{ if \(ok !== false\) setSaved\(true\); \}\)/);
    expect(page).toMatch(/\{saved && <span className="tq-st" role="status">Saved<\/span>\}/);
  });
});
