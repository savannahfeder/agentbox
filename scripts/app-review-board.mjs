// THE APP REVIEW BOARD: will the phone app's App Store submission be accepted
// first time? Independent mock reviewers (Codex and Claude, each reading the
// store build's source as an Apple reviewer) give each risk its odds, and hard
// checks test what a reviewer meets live. It says submit only when the odds of
// acceptance are at least BAR, at least two reviewers answered, and every check
// passed. The odds are the reviewers' judgement, anchored to Apple's published
// rejection rate, not a measurement.
//
//   node scripts/app-review-board.mjs [--codex 2] [--claude 1] [--out dir] [--prompt-only]
//     [--with review.txt]... [--assume "what will be true by submission"]...
//
// `--assume` gives the odds once the person's own steps are done; with any
// assumption the board never says submit.
//
// The demo account is checked when REVIEW_EMAIL and REVIEW_PASSWORD are set.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CLOUD_ADDRESS } from '../shared/cloud-address.mts';

export const BAR = 0.9;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REVIEWER_MS = 40 * 60_000;

// "2.1(a)" and "2.1" are one risk; "5.1.1(v)" and "5.1.1(i)" are two.
const ROMAN = /^\((?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\)$/i;
function keyOf(guideline) {
  const m = String(guideline).trim().match(/^(\d+(?:\.\d+)*)\s*(\([^)]*\))?/);
  if (!m) return String(guideline).trim().toLowerCase();
  return m[2] && ROMAN.test(m[2]) ? `${m[1]}${m[2].toLowerCase()}` : m[1];
}

const isOdds = (p) => typeof p === 'number' && p >= 0 && p <= 1;

/** The last JSON block a reviewer wrote, or null when it is not a review. */
export function parseReview(text) {
  const blocks = [...String(text).matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1]);
  for (const raw of blocks.reverse()) {
    let v;
    try { v = JSON.parse(raw); } catch { continue; }
    if (!Array.isArray(v?.risks) || !isOdds(v.p_first_acceptance)) return null;
    if (!v.risks.every((r) => r && typeof r.guideline === 'string' && isOdds(r.p_reject))) return null;
    return v;
  }
  return null;
}

/** Each risk at the highest odds any reviewer gave it; acceptance is the chance none fires, capped by the most doubtful reviewer. */
export function combine(reviews) {
  const answered = reviews.filter((r) => r.ok);
  const byKey = new Map();
  for (const r of answered) {
    for (const risk of r.risks) {
      const k = keyOf(risk.guideline);
      const had = byKey.get(k);
      const seen = { engine: r.engine, ...risk };
      if (!had) byKey.set(k, { guideline: k, p_reject: risk.p_reject, seen: [seen] });
      else { had.p_reject = Math.max(had.p_reject, risk.p_reject); had.seen.push(seen); }
    }
  }
  const risks = [...byKey.values()].sort((a, b) => b.p_reject - a.p_reject);
  const noneFires = risks.reduce((p, r) => p * (1 - r.p_reject), 1);
  const p_accept = answered.length ? Math.min(noneFires, ...answered.map((r) => r.p_first_acceptance)) : null;
  return {
    risks,
    p_accept,
    reviewers: { answered: answered.length, failed: reviews.length - answered.length },
    cannot_verify: [...new Set(answered.flatMap((r) => r.cannot_verify ?? []))],
  };
}

export function verdict(board, checks, assume = []) {
  const why = [];
  if (assume.length) why.push(`these odds assume ${assume.length} thing${assume.length === 1 ? '' : 's'} not yet checked`);
  if (board.p_accept == null || board.p_accept < BAR) why.push(`odds of acceptance ${board.p_accept == null ? 'unknown' : `${Math.round(board.p_accept * 100)}%`}, under ${BAR * 100}%`);
  if (board.reviewers.answered < 2) why.push(`${board.reviewers.answered} reviewer answered; two are needed`);
  for (const c of checks) if (c.ok !== true) why.push(`${c.name}: ${c.ok === null ? 'not checked' : 'failed'}${c.detail ? ` (${c.detail})` : ''}`);
  return { submit: why.length === 0, why };
}

async function withDeadline(fetchImpl, url, init, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetchImpl(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

/** What a reviewer meets live. ok is true, false, or null for a check that could not run. */
export async function gateChecks({ listing, fetchImpl = fetch, env = process.env, deadlineMs = 20_000 }) {
  const get = async (url) => {
    try {
      const res = await withDeadline(fetchImpl, url, { headers: { 'user-agent': 'Mozilla/5.0' } }, deadlineMs);
      return { status: res.status, body: await res.text() };
    } catch (err) { return { status: 0, body: '', error: String(err?.message ?? err) }; }
  };
  // The phone site answers every address with the web app, so a 200 proves nothing.
  const isWebApp = (body) => /name="agentbox-cloud"/.test(body);
  const page = async (name, url, needs) => {
    const r = await get(url);
    const ok = r.status === 200 && !isWebApp(r.body) && needs.every((re) => re.test(r.body));
    return { name, ok, detail: ok ? url : `${url}: ${r.error ?? (isWebApp(r.body) ? 'the web app, not the page' : `HTTP ${r.status}`)}` };
  };
  const base = listing.privacyPolicyUrl.replace(/\/privacy$/, '');
  const checks = [
    await page('privacy policy is live', listing.privacyPolicyUrl, [/Privacy Policy/i]),
    await page('terms are live', `${base}/terms`, [/Terms/i]),
    await page('Help page is live, with an email', listing.supportUrl, [/Help/i, /[\w.+-]+@[\w-]+\.[\w.]+/]),
  ];
  const marketing = await get(listing.marketingUrl);
  checks.push({ name: 'marketing page answers', ok: marketing.status === 200, detail: listing.marketingUrl });
  checks.push(await demoAccount({ fetchImpl, env, deadlineMs }));
  return checks;
}

async function demoAccount({ fetchImpl, env, deadlineMs }) {
  const name = 'demo account signs in and has threads';
  if (!env.REVIEW_EMAIL || !env.REVIEW_PASSWORD) return { name, ok: null, detail: 'no REVIEW_EMAIL and REVIEW_PASSWORD given' };
  const { supabaseUrl: url, anonKey } = CLOUD_ADDRESS;
  try {
    const signIn = await withDeadline(fetchImpl, `${url}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email: env.REVIEW_EMAIL, password: env.REVIEW_PASSWORD }),
    }, deadlineMs);
    const session = await signIn.json();
    if (!signIn.ok || !session.access_token) return { name, ok: false, detail: 'sign-in refused' };
    const count = async (table) => {
      const r = await withDeadline(fetchImpl, `${url}/rest/v1/${table}?select=*&limit=1`, { headers: { apikey: anonKey, authorization: `Bearer ${session.access_token}` } }, deadlineMs);
      return r.ok ? (await r.json()).length : -1;
    };
    const [projects, threads] = [await count('phone_projects'), await count('phone_threads')];
    return { name, ok: projects > 0 && threads > 0, detail: `projects ${projects > 0 ? 'yes' : 'none'}, threads ${threads > 0 ? 'yes' : 'none'}` };
  } catch (err) { return { name, ok: false, detail: String(err?.message ?? err) }; }
}

export function reviewerPrompt({ listing, notes, checks, assume = [] }) {
  return `You are an Apple App Review reviewer. This iPhone app is about to be submitted to the public App Store for the first time. Predict whether it is accepted on the first submission.

Read the current App Review Guidelines yourself: https://developer.apple.com/app-store/review/guidelines/ . Do not rely on memory.

Calibrate against Apple's own numbers: in 2025 Apple reviewed 9,100,620 submissions and rejected 2,093,244 (23%), over 1.2 million of the rejections were new apps, and Performance (2.1 app completeness, the demo account, crashes) was the largest category (2025 App Store Transparency Report).

THE APP: Agentbox for iPhone, in mobile/ (Expo, expo-router; screens mobile/src/app, UI mobile/src/ui, logic mobile/src/lib and mobile/src/state, config mobile/app.config.ts, build profiles mobile/eas.json). It shows the threads of AI coding agents (Claude Code or Codex, on the user's own subscription) that run on the user's computer or in Agentbox Cloud. The build submitted is the "store" profile: EXPO_PUBLIC_STORE_BUILD=1 (mobile/src/lib/store-build.ts), so read every STORE_BUILD branch as taken. The reviewer has a phone and the demo account, and no computer.

THE LISTING (mobile/store.config.json): ${JSON.stringify(listing)}

THE REVIEW NOTES: ${JSON.stringify(notes)}

WHAT WAS CHECKED LIVE just now:
${checks.map((c) => `- ${c.name}: ${c.ok === true ? 'yes' : c.ok === false ? 'NO' : 'not checked'}${c.detail ? ` (${c.detail})` : ''}`).join('\n')}
${assume.length ? `\nASSUMED TRUE BY SUBMISSION, NOT YET CHECKED:\n${assume.map((a) => `- ${a}`).join('\n')}\nWhere an assumption and a live check disagree, judge the app as it will be once the assumptions hold, and price each assumption's own chance of going wrong into your odds.\n` : ''}
Go through the app the way a reviewer does: launch, sign in with the demo account, every tab, a thread, reply, new thread, attachments, dictation, alerts, Settings, the privacy policy, Delete account, every link out. Do not edit any file and do not run the test suite.

Answer with your reasoning, then end with exactly one JSON block:
\`\`\`json
{"risks":[{"guideline":"2.1","p_reject":0.15,"what_the_reviewer_sees":"...","evidence":"file:line","fix":"..."}],"p_first_acceptance":0.8,"cannot_verify":["..."]}
\`\`\`
p_reject is the probability that this issue, by itself, gets the first submission rejected. List each issue at 0.02 or more. p_first_acceptance is your overall probability that the first submission is accepted. Be calibrated, not reassuring: a risk you cannot rule out from the source (such as whether the demo account really answers) still carries its odds.`;
}

function copyOfTheApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-review-board-'));
  const tar = execFileSync('git', ['archive', 'HEAD', 'mobile', 'shared', 'renderer/src', 'phone-legal', 'docs/mobile', 'CLAUDE.md'], { cwd: root, maxBuffer: 1 << 30 });
  execFileSync('tar', ['-x', '-C', dir], { input: tar });
  return dir;
}

function run(engine, prompt, dir) {
  const argv = engine === 'codex'
    ? ['codex', ['exec', '-c', 'model_reasoning_effort=high', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '-C', dir, prompt]]
    : ['claude', ['-p', prompt, '--allowedTools', 'Read,Grep,Glob,WebFetch,WebSearch', '--permission-mode', 'dontAsk']];
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv[1], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const t = setTimeout(() => child.kill('SIGTERM'), REVIEWER_MS);
    child.on('error', (err) => { clearTimeout(t); resolve({ engine, ok: false, error: err.message, text: out }); });
    child.on('close', (code) => {
      clearTimeout(t);
      const v = parseReview(out);
      resolve(v ? { engine, ok: true, ...v, text: out } : { engine, ok: false, error: `no review (exit ${code})`, text: out.slice(-2000) });
    });
  });
}

function report(board, checks, decision, assume = []) {
  const pct = (p) => (p == null ? 'unknown' : `${Math.round(p * 100)}%`);
  return [
    `# App review board, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    `**${decision.submit ? 'Submit.' : 'Not yet.'}** Odds of first acceptance: ${pct(board.p_accept)} (bar ${BAR * 100}%). Reviewers answered: ${board.reviewers.answered}, failed: ${board.reviewers.failed}.`,
    '',
    ...(assume.length ? ['## These odds assume, not yet checked', '', ...assume.map((a) => `- ${a}`), ''] : []),
    ...(decision.why.length ? ['## What stands in the way', '', ...decision.why.map((w) => `- ${w}`), ''] : []),
    '## Risks, highest first', '',
    '| Guideline | Odds it rejects | What the reviewer sees | Fix |', '|---|---|---|---|',
    ...board.risks.map((r) => `| ${r.guideline} | ${pct(r.p_reject)} | ${r.seen.map((s) => `${s.engine}: ${s.what_the_reviewer_sees ?? ''}`).join('<br>').replace(/\|/g, '/')} | ${(r.seen.find((s) => s.p_reject === r.p_reject)?.fix ?? '').replace(/\|/g, '/')} |`),
    '', '## Live checks', '',
    ...checks.map((c) => `- ${c.ok === true ? 'yes' : c.ok === false ? 'NO' : 'not checked'}: ${c.name}${c.detail ? ` (${c.detail})` : ''}`),
    '', '## What no reviewer could verify from the source', '',
    ...board.cannot_verify.map((c) => `- ${c}`),
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i === -1 ? dflt : args[i + 1]; };
  const store = JSON.parse(fs.readFileSync(path.join(root, 'mobile', 'store.config.json'), 'utf8')).apple;
  const listing = store.info['en-US'];
  const checks = await gateChecks({ listing });
  const assume = args.flatMap((a, i) => (a === '--assume' ? [args[i + 1]] : []));
  const prompt = reviewerPrompt({ listing, notes: store.review.notes, checks, assume });
  const out = opt('out', fs.mkdtempSync(path.join(os.tmpdir(), 'app-review-board-out-')));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'prompt.txt'), prompt);
  if (args.includes('--prompt-only')) { console.log(path.join(out, 'prompt.txt')); return; }
  const dir = copyOfTheApp();
  const engines = [...Array(Number(opt('codex', 2))).fill('codex'), ...Array(Number(opt('claude', 1))).fill('claude')];
  const reviews = await Promise.all(engines.map((e) => run(e, prompt, dir)));
  // Reviews made elsewhere (a Claude session's helpers, say) join through --with.
  for (const f of args.flatMap((a, i) => (a === '--with' ? [args[i + 1]] : []))) {
    const v = parseReview(fs.readFileSync(f, 'utf8'));
    reviews.push(v ? { engine: path.basename(f), ok: true, ...v } : { engine: path.basename(f), ok: false, error: 'no review in file' });
  }
  reviews.forEach((r, i) => fs.writeFileSync(path.join(out, `reviewer-${i + 1}-${r.engine}.txt`), r.text ?? ''));
  const board = combine(reviews);
  const decision = verdict(board, checks, assume);
  fs.writeFileSync(path.join(out, 'board.json'), JSON.stringify({ board, checks, decision, reviews: reviews.map(({ text: _t, ...r }) => r) }, null, 2));
  fs.writeFileSync(path.join(out, 'report.md'), report(board, checks, decision, assume));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(path.join(out, 'report.md'));
  process.exitCode = decision.submit ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
