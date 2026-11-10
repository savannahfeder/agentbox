#!/usr/bin/env node
// A SCENE FOR PICTURES AND FILMS OF LIVE EDITING: one copy of the app (the
// rig's browser copy) signed in to a stand-in team cloud, its project shared,
// and a Team thread holding the launch plan. Prints the copy's address and the
// team, which crowd.mjs and shot.mjs take.
//
//   node scripts/live-scene/scene.mjs > /tmp/live-scene/scene.json
//
// Kept beside the code rather than in scripts/scratch because every change to
// how presence looks is judged in pictures of this scene, and the launch film
// is shot in it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const ROOT = '/tmp/live-scene';
const PORT = 54900;
const CLOUD = `http://127.0.0.1:${PORT}`;
const LIVE = path.join(REPO, '.claude/skills/verify-agentbox/scripts/live.mjs');
fs.mkdirSync(ROOT, { recursive: true });

const post = async (door, body) => {
  const r = await fetch(`${CLOUD}/${door}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  const out = await r.json();
  if (!r.ok) throw new Error(`${door}: ${out.error}`);
  return out;
};

async function cloudUp() {
  try { await post('signin', { email: 'probe@lumen.test' }); return; } catch { /* not up yet */ }
  const log = fs.openSync(path.join(ROOT, 'cloud.log'), 'a');
  spawn(process.execPath, [path.join(REPO, 'cloud/standin/server.mjs'), '--port', String(PORT), '--file', path.join(ROOT, 'cloud.json')], { detached: true, stdio: ['ignore', log, log] }).unref();
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try { await post('signin', { email: 'probe@lumen.test' }); return; } catch { /* waiting */ }
  }
  throw new Error('the stand-in cloud did not start');
}

await cloudUp();
const maya = await post('signin', { email: 'maya@lumen.test', password: 'x', name: 'Maya Chen' });
const teams = (await post('call', { token: maya.token, method: 'myTeams', args: [] }).catch(() => ({ value: null }))).value;
const team = Array.isArray(teams) && teams[0] ? teams[0] : (await post('call', { token: maya.token, method: 'createTeam', args: ['Lumen'] })).value;
const teamId = team.id ?? team.teamId;

fs.writeFileSync(path.join(ROOT, 'standin.json'), JSON.stringify({ url: CLOUD, anonKey: 'standin', standin: true }));
fs.writeFileSync(path.join(ROOT, 'maya.json'), JSON.stringify({ config: path.join(ROOT, 'standin.json'), email: 'maya@lumen.test', password: 'x' }), { mode: 0o600 });
const env = { ...process.env, VERIFY_INSTANCE: 'maya', VERIFY_CHROME: process.env.VERIFY_CHROME ?? '/opt/agentbox/chromium.sh' };
const up = spawnSync(process.execPath, [LIVE, 'up', '--team', path.join(ROOT, 'maya.json'), '--projects', 'Launch'], { env, encoding: 'utf8', timeout: 300_000 });
fs.writeFileSync(path.join(ROOT, 'up.log'), `${up.stdout}\n${up.stderr}`);
const { instanceDir } = await import(LIVE);
const { machinery } = await import(path.join(REPO, '.claude/skills/verify-agentbox/scripts/drives.mjs'));
const state = JSON.parse(fs.readFileSync(path.join(instanceDir('maya'), 'instance.json'), 'utf8'));

const slug = fs.readdirSync(state.accountRoot).find((d) => {
  try { return JSON.parse(fs.readFileSync(path.join(state.accountRoot, d, 'project.json'), 'utf8')).name === 'Launch'; } catch { return false; }
});
const projectFile = path.join(state.accountRoot, slug, 'project.json');
const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
project.team ??= { projectId: crypto.randomUUID(), teamId, visibility: 'team', people: [], sharedBy: maya.personId };
fs.writeFileSync(projectFile, JSON.stringify(project, null, 2));
await post('call', { token: maya.token, method: 'shareProject', args: [{ id: project.team.projectId, teamId, name: 'Launch' }] }).catch(() => {});

const ledger = path.join(machinery(state, slug), 'work-items.jsonl');
const had = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8') : '';
if (!had.includes('designs/')) {
  const now = Date.now();
  const lines = [];
  const threads = [
    { title: 'Plan the launch together', name: 'launch-plan.md', body: fs.readFileSync(path.join(HERE, 'launch-plan.md'), 'utf8'), ask: 'Is a Tuesday morning launch right?', said: 'The plan is one post and one email, with the pricing page read by two customers first.', options: ['Tuesday it is (recommended)', 'Move it to Thursday'] },
    { title: 'Pick the first teams to write to', name: 'launch-leads.csv', body: fs.readFileSync(path.join(HERE, 'launch-leads.csv'), 'utf8'), ask: 'Pick who we write to first.', said: 'The table has 40 teams with an owner and a stage each.', options: ['Start with the New ones (recommended)', 'Drop the agencies'] },
  ];
  threads.forEach((t, i) => {
    const id = `w-${crypto.randomBytes(5).toString('hex')}`;
    const file = `designs/${id}/${t.name}`;
    const at = now - (i + 1) * 20 * 60_000;
    fs.mkdirSync(path.dirname(path.join(state.accountRoot, slug, file)), { recursive: true });
    fs.writeFileSync(path.join(state.accountRoot, slug, file), t.body);
    lines.push({ id, ts: at, source: 'system', patch: { title: t.title, status: 'open', kind: 'directive', priority: 5, labels: ['founder'], visibility: 'team' } });
    lines.push({ id, ts: at + 3, source: 'founder', patch: { title: t.title, model: 'opus' } });
    lines.push({ id, ts: at + 9 * 60_000, source: 'agent', patch: { result: `**${t.ask}**\n\n${t.said}\n\n${file}\n\n## Options\n1. ${t.options[0]}\n2. ${t.options[1]}` } });
  });
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.appendFileSync(ledger, lines.map((l) => `${JSON.stringify(l)}\n`).join(''));
}
const files = (name) => {
  const dir = path.join(state.accountRoot, slug, 'designs');
  return fs.readdirSync(dir).map((d) => path.join(dir, d, name)).find((f) => fs.existsSync(f));
};
console.log(JSON.stringify({ url: state.url, teamId, plan: files('launch-plan.md'), leads: files('launch-leads.csv'), upCode: up.status }, null, 1));
