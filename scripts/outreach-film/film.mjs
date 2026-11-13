#!/usr/bin/env node
// One command makes one lead's outreach film. README.md beside this file is the
// whole manual; run with no arguments for the short version.
//
//   node scripts/outreach-film/film.mjs make <lead dir> --kit <kit dir> [--out <dir>] [--writer "<command>"] [--no-voice]
//   node scripts/outreach-film/film.mjs check <lead dir>
//   node scripts/outreach-film/film.mjs check-film <film.mp4> [<film.mp4.cuts.json>]
//
// Exit codes: 0 film made; 1 brief.json has problems (listed); 2 setup or kit
// missing something (named); 3 brief.json not written yet; 4 lead skipped (its
// site cannot be read well enough); 5 the film failed its checks twice.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkBrief, tidyBrief } from './lib/brief.mjs';
import { filmFromBrief } from './lib/assemble.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
// Her voice cut runs 97.1 s; the screen is filmed a little past it.
const RECORD_END = 97.4, FILM_END = 97.1;
const say = (s = '') => process.stdout.write(`${s}\n`);
const stop = (code, msg) => { say(msg); process.exit(code); };
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8', timeout: opts.timeout ?? 60 * 60_000, env: { ...process.env, ...opts.env }, cwd: opts.cwd, input: opts.input });
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const exists = (f) => fs.existsSync(f);

const [cmd, target, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : null; };
const has = (name) => rest.includes(name);

if (!cmd || cmd === 'help' || cmd === '--help') {
  stop(0, fs.readFileSync(path.join(HERE, 'README.md'), 'utf8').split('\n## ')[0]);
}
if (cmd === 'check-film') {
  const r = run('python3', [path.join(HERE, 'check-film.py'), target, ...(rest[0] ? [rest[0]] : [])]);
  process.exit(r.status ?? 1);
}
if (!target || !exists(target)) stop(2, `No lead folder at ${target}. Make one with lead.json in it (see README.md).`);
const dir = path.resolve(target);
const F = (name) => path.join(dir, name);

// ---- the lead ----
if (!exists(F('lead.json'))) stop(2, `${F('lead.json')} is missing. Write {"name": "<Company>", "domain": "<company.com>"}.`);
const leadRaw = readJson(F('lead.json'));
const lead = { name: leadRaw.name ?? leadRaw.company?.name, domain: (leadRaw.domain ?? leadRaw.company?.domain ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '') };
if (!lead.name || !lead.domain) stop(2, `${F('lead.json')} needs "name" and "domain", like {"name": "Acme", "domain": "acme.com"}.`);
const slug = lead.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- 1. read their site, no model ----
if (!exists(F('site.json')) || !exists(F('site.png'))) {
  say(`Reading ${lead.domain}...`);
  const r = run('node', [path.join(HERE, 'research.mjs'), lead.domain, dir, '--name', lead.name], { timeout: 5 * 60_000 });
  if (r.status !== 0 || !exists(F('site.json'))) stop(4, `Could not read ${lead.domain}. Skip this lead.`);
}
const site = readJson(F('site.json'));
if (site.problems?.length) stop(4, `Skip this lead: ${site.problems.join('; ')}.\n(Delete site.json to read the site again.)`);

// ---- 2. the brief, which a model writes ----
const writer = opt('--writer');
const BRIEF_PROMPT = `You are filling in the outreach film brief for ${lead.name} (${lead.domain}).
Read ${path.join(HERE, 'BRIEF.md')} and follow it exactly. Then read site.json and lead.json in ${dir}.
Write ${F('brief.json')}, shaped exactly like ${path.join(HERE, 'brief.example.json')}, and nothing else.
Do not browse the web: site.json is the only source about the company.`;
function write(prompt) {
  say(`Asking the writer: ${writer}`);
  const r = run('sh', ['-c', writer], { cwd: dir, input: prompt, quiet: true, timeout: 20 * 60_000 });
  fs.appendFileSync(F('writer.log'), `\n==== ${new Date().toISOString()}\n${r.stdout ?? ''}\n${r.stderr ?? ''}`);
}
if (!exists(F('brief.json'))) {
  if (!writer) stop(3, `brief.json is not written yet. This is the one step that needs a model:\n\n${BRIEF_PROMPT}\n\nThen run this command again.`);
  write(BRIEF_PROMPT);
}

// ---- 3. check the brief and draw the headlines, no model ----
function drawHeadlines(b) {
  const want = JSON.stringify(b.headlines?.lines ?? []);
  const report = exists(F('headlines.png.json')) ? readJson(F('headlines.png.json')) : null;
  if (report && JSON.stringify(report.headlines.map((h) => h.text)) === want && exists(F('headlines.png'))) return report;
  if (!Array.isArray(b.headlines?.lines) || b.headlines.lines.length !== 3 || b.headlines.lines.some((h) => typeof h !== 'string' || !h)) return null;
  say('Drawing the three headlines on their page...');
  run('node', [path.join(HERE, 'headlines.mjs'), lead.domain, F('headlines.png'), ...b.headlines.lines], { quiet: true, timeout: 5 * 60_000 });
  return exists(F('headlines.png.json')) ? readJson(F('headlines.png.json')) : null;
}
function briefProblems() {
  let raw;
  try { raw = readJson(F('brief.json')); } catch (e) { return [`brief.json: is not valid JSON (${e.message})`]; }
  const b = tidyBrief(raw);
  fs.writeFileSync(F('brief.json'), JSON.stringify(b, null, 1));
  const report = drawHeadlines(b);
  const problems = checkBrief(b, site, report);
  if (!problems.length && !report) problems.push('headlines: could not be drawn on their page');
  return problems;
}
let problems = briefProblems();
for (let round = 1; problems.length && writer && round <= 3; round += 1) {
  write(`brief.json in ${dir} has these problems. Fix every one, keep everything else as it is, and save brief.json. Do not browse the web.\n${problems.map((p) => `- ${p}`).join('\n')}`);
  problems = briefProblems();
}
if (problems.length) stop(1, `brief.json has ${problems.length} problem(s). Fix each in ${F('brief.json')}, then run this command again:\n${problems.map((p) => `- ${p}`).join('\n')}`);
if (cmd === 'check') stop(0, 'brief.json passes. Next: film.mjs make.');
if (cmd !== 'make') stop(2, `Unknown command ${cmd}. Use make, check or check-film.`);

// ---- 4. the machine, and the kit: her voice and bubble, the icons, the sounds ----
const tools = [['ffmpeg', ['-version']], ['python3', ['-c', 'import numpy, PIL, cv2']]];
if (process.platform === 'linux') tools.push(['sh', ['-c', 'fc-list | grep -q "SF Pro Text"']]);
if (tools.some(([c, a]) => run(c, a, { quiet: true }).status !== 0)) stop(2, `This machine is missing something the film needs. Run: sh ${path.join(HERE, 'setup.sh')}`);
const kit = opt('--kit') ?? process.env.OUTREACH_KIT;
if (!kit || !exists(kit)) stop(2, 'Pass --kit <dir>: the outreach-films/kit folder in the product documents (README.md says what is in it).');
const need = ['pointer.svg', 'cues.json', 'icons/chrome.png', 'icons/terminal.png', 'icons/agentbox.png', 'icons/finder.png', 'sfx/pad1.wav', 'sfx/pad2.wav', 'sfx/pad3.wav', 'sfx/key1.wav'];
const missing = need.filter((f) => !exists(path.join(kit, f)));
if (missing.length) stop(2, `The kit at ${kit} is missing: ${missing.join(', ')}.`);
const work = fs.mkdtempSync(path.join(os.tmpdir(), `film-${slug}-`));
let face = path.join(kit, 'voice/face.mp4');
if (!exists(face)) {
  const parts = exists(path.join(kit, 'voice')) ? fs.readdirSync(path.join(kit, 'voice')).filter((f) => /^face\.part-\d+\.mp4$/.test(f)).sort() : [];
  if (parts.length) {
    fs.writeFileSync(path.join(work, 'parts.txt'), parts.map((p) => `file '${path.join(kit, 'voice', p)}'`).join('\n'));
    face = path.join(work, 'face.mp4');
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(work, 'parts.txt'), '-c', 'copy', face]);
  } else if (has('--no-voice')) {
    face = path.join(work, 'stand-in.mp4');
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x3a3a3c:s=520x520:d=${FILM_END}`, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(FILM_END), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', face]);
  } else stop(2, `The kit has no voice: put face.mp4 (or face.part-1.mp4, face.part-2.mp4...) in ${path.join(kit, 'voice')}, or pass --no-voice for a silent screen check.`);
}

// ---- 5. the app, built once per version of it ----
// The app's own folders, so a commit that changes only the film's tools reuses the build.
const sha = crypto.createHash('sha1').update(run('git', ['-C', REPO, 'rev-parse', 'HEAD:renderer', 'HEAD:shared', 'HEAD:package-lock.json'], { quiet: true }).stdout).digest('hex');
const hookHash = crypto.createHash('sha1').update(fs.readFileSync(path.join(HERE, 'demo-hook.mjs'))).update(fs.readFileSync(path.join(HERE, 'vite.film.config.mjs'))).digest('hex').slice(0, 8);
const dist = path.join(os.tmpdir(), `outreach-film-app-${sha.slice(0, 10)}-${hookHash}`);
if (!exists(path.join(dist, 'index.html'))) {
  if (!exists(path.join(REPO, 'node_modules/vite'))) stop(2, `Run \`npm ci --ignore-scripts\` in ${REPO} first; the film builds the app's screen from it.`);
  say('Building the app for the film (about a minute)...');
  const r = run('node', [path.join(REPO, 'node_modules/vite/bin/vite.js'), 'build', '--config', path.join(HERE, 'vite.film.config.mjs')], { cwd: REPO, env: { FILM_DIST: dist }, quiet: true });
  if (r.status !== 0) stop(2, `The app did not build for the film:\n${(r.stderr || r.stdout).slice(-2000)}`);
}

// ---- 6. film, finish, watch: twice at most ----
const brief = readJson(F('brief.json'));
const logo = path.join(work, 'logo.png');
fs.copyFileSync(F('logo.png'), logo);
run('python3', [path.join(HERE, 'logo-on-dark.py'), logo], { quiet: true });
fs.writeFileSync(F('film.json'), JSON.stringify(filmFromBrief(brief, { logo, site: F('site.png'), headlines: F('headlines.png') }), null, 1));
const masks = path.join(work, 'masks');
fs.mkdirSync(masks);
run('python3', [path.join(HERE, 'masks.py'), masks, '280'], { quiet: true });
const outDir = path.resolve(opt('--out') ?? dir);
fs.mkdirSync(outDir, { recursive: true });
let failed = [];
for (let take = 1; take <= 2; take += 1) {
  say(`Filming take ${take} (about 10 minutes)...`);
  const screen = path.join(work, `screen-${take}.mp4`);
  const rec = run('node', [path.join(HERE, 'record.mjs'), F('film.json'), path.join(kit, 'cues.json'), screen, String(RECORD_END), '--dist', dist, '--kit', kit], { env: { SLOW: '5', SHOT_CHROME: process.env.SHOT_CHROME ?? '' }, quiet: true });
  fs.writeFileSync(F(`record-${take}.log`), `${rec.stdout ?? ''}${rec.stderr ?? ''}`);
  if (rec.status !== 0) { failed = (exists(`${screen}.json`) ? readJson(`${screen}.json`).failures : null) ?? [`the recorder stopped: ${(rec.stderr || '').slice(-300)}`]; say(`Take ${take} failed: ${failed.join('; ')}`); continue; }
  say('Finishing: her voice and bubble, the clicks and keys (about 5 minutes)...');
  const final = path.join(work, `film-${take}.mp4`);
  const fin = run('python3', [path.join(HERE, 'finish.py'), screen, face, masks, path.join(kit, 'sfx'), final, '--move-at', '-1', '--end', String(FILM_END)], { quiet: true, env: { CRF: '18' } });
  fs.writeFileSync(F(`finish-${take}.log`), `${fin.stdout ?? ''}${fin.stderr ?? ''}`);
  if (fin.status !== 0 || !exists(final)) { failed = [`the finish stopped: ${(fin.stderr || '').slice(-300)}`]; say(`Take ${take} failed: ${failed[0]}`); continue; }
  const chk = run('python3', [path.join(HERE, 'check-film.py'), final, `${final}.cuts.json`, '--json', path.join(work, 'check.json')], { quiet: true });
  if (chk.status !== 0) { failed = readJson(path.join(work, 'check.json')).problems; say(`Take ${take} failed its check:\n${failed.map((p) => `- ${p}`).join('\n')}`); continue; }
  // Passed: the next version number beside the earlier ones, a contact sheet, a report.
  const taken = fs.readdirSync(outDir).map((f) => f.match(new RegExp(`^${slug}-outreach-v(\\d+)\\.mp4$`))?.[1]).filter(Boolean).map(Number);
  const name = `${slug}-outreach-v${Math.max(0, ...taken) + 1}`;
  const film = path.join(outDir, `${name}.mp4`);
  fs.copyFileSync(final, film);
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', film, '-vf', 'fps=1/4,scale=480:-1,tile=5x5', '-frames:v', '1', path.join(outDir, `${name}.sheet.png`)]);
  fs.writeFileSync(path.join(outDir, `${name}.report.json`), JSON.stringify({ lead, film, take, voice: !has('--no-voice'), check: readJson(path.join(work, 'check.json')), cuts: readJson(`${final}.cuts.json`) }, null, 1));
  fs.rmSync(work, { recursive: true, force: true });
  stop(0, `Made ${film}${has('--no-voice') ? ' (silent screen check, no voice)' : ''}\nContact sheet: ${path.join(outDir, `${name}.sheet.png`)}`);
}
fs.rmSync(work, { recursive: true, force: true });
stop(5, `No film: both takes failed.\n${failed.map((p) => `- ${p}`).join('\n')}\nThe logs are record-*.log and finish-*.log in ${dir}.`);
