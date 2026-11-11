// A SHARED FILE'S PAGE, END TO END ON THIS COMPUTER, for seeing it and for testers.
//
// Two servers on 127.0.0.1:
//   - a stand-in database (PGlite running every migration) answering the
//     database calls renderer/src/cloud-rest.ts makes: POST /rest/v1/rpc/<fn>
//     and the sign-up, password sign-in, user and renewal calls. A sign-up is
//     signed in at once; no email is sent.
//   - the web app as scripts/build-phone-site.mjs writes it, with /f/* going
//     through its `_worker.js` and every other address a file, `_headers` applied.
//
//   node scripts/shared-file-stage.mjs [--seed] [--no-build] [--db-port 54329] [--site-port 8788]
//
// --seed signs in Maya Chen and shares a document, a page, a picture and a
// PDF, plus one link she then stopped, and prints their addresses.
// --no-build serves renderer/dist as it is.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { buildPhoneSite } from './build-phone-site.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANON_KEY = 'stage-anon-key-0123456789';

const STAND_IN = `
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role authenticated;
create role anon;
create role service_role;
create publication supabase_realtime;
`;
const GRANTS = `
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to anon;
`;

export async function startDatabase({ port = 54329, log = () => {} } = {}) {
  const dir = path.join(root, 'cloud/supabase/migrations');
  const db = new PGlite();
  await db.exec(STAND_IN);
  await db.exec(fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n'));
  await db.exec(GRANTS);

  // One statement at a time: the role and the person are set per request.
  let queue = Promise.resolve();
  const one = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };
  const as = (person, role, sql, params) => one(async () => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role ${role};`);
    try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
  });

  const people = new Map(); // email -> { id, password }
  const tokens = new Map(); // access or refresh token -> id
  const emailOf = (id) => [...people].find(([, p]) => p.id === id)?.[0] ?? null;
  const session = (id) => {
    const access = crypto.randomBytes(24).toString('hex');
    const refresh = crypto.randomBytes(24).toString('hex');
    tokens.set(access, id);
    tokens.set(`r:${refresh}`, id);
    return { access_token: access, refresh_token: refresh, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id, email: emailOf(id) } };
  };
  async function signUp(email, password, name) {
    const key = String(email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(key)) throw Object.assign(new Error('Unable to validate email address: invalid format'), { status: 400 });
    if (String(password ?? '').length < 6) throw Object.assign(new Error('Password should be at least 6 characters.'), { status: 422 });
    if (people.has(key)) throw Object.assign(new Error('User already registered'), { status: 422 });
    const id = crypto.randomUUID();
    people.set(key, { id, password });
    await one(() => db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [id, key, { full_name: String(name ?? '').trim() }]));
    return session(id);
  }

  const procs = new Map();
  async function returnsRows(fn) {
    if (!procs.has(fn)) {
      const { rows } = await one(() => db.query(`select proretset, prorettype::regtype::text as t from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname = $1 limit 1`, [fn]));
      if (!rows[0]) return null;
      procs.set(fn, { set: rows[0].proretset, isVoid: rows[0].t === 'void' });
    }
    return procs.get(fn);
  }

  async function rpc(fn, args, who) {
    if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw Object.assign(new Error('not a function'), { status: 404 });
    const shape = await returnsRows(fn);
    if (!shape) throw Object.assign(new Error(`Could not find the function public.${fn}`), { status: 404 });
    const names = Object.keys(args ?? {});
    if (names.some((n) => !/^[a-z_][a-z0-9_]*$/.test(n))) throw Object.assign(new Error('bad argument'), { status: 400 });
    const call = `public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})`;
    const params = names.map((n) => args[n]);
    const role = who ? 'authenticated' : 'anon';
    try {
      if (shape.set) return (await as(who, role, `select * from ${call}`, params)).rows;
      const { rows } = await as(who, role, `select ${call} as v`, params);
      return shape.isVoid ? null : rows[0]?.v ?? null;
    } catch (err) {
      const denied = /permission denied/i.test(err.message);
      throw Object.assign(new Error(err.message), { status: denied ? 401 : 400, code: err.code });
    }
  }

  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'apikey, authorization, content-type, prefer, x-client-info, x-upsert',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
  const send = (res, status, body) => {
    res.writeHead(status, { ...cors, 'content-type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const said = (res, err) => send(res, err.status ?? 500, { message: err.message, msg: err.message, code: err.code ?? null });

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const url = new URL(req.url, 'http://127.0.0.1');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { send(res, 400, { message: 'not JSON' }); return; }
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? null;
    if (req.headers.apikey !== ANON_KEY) { send(res, 401, { message: 'Invalid API key' }); return; }
    const who = bearer && bearer !== ANON_KEY ? tokens.get(bearer) : null;
    if (bearer && bearer !== ANON_KEY && !who) { send(res, 401, { message: 'JWT expired' }); return; }
    log(`${req.method} ${url.pathname}${url.search}`);
    try {
      const m = /^\/rest\/v1\/rpc\/([^/]+)$/.exec(url.pathname);
      if (m && req.method === 'POST') { send(res, 200, await rpc(m[1], body, who)); return; }
      if (url.pathname === '/auth/v1/signup' && req.method === 'POST') { send(res, 200, await signUp(body.email, body.password, body.data?.full_name)); return; }
      if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
        const grant = url.searchParams.get('grant_type');
        if (grant === 'password') {
          const p = people.get(String(body.email ?? '').trim().toLowerCase());
          if (!p || p.password !== body.password) { send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }); return; }
          send(res, 200, session(p.id)); return;
        }
        if (grant === 'refresh_token') {
          const id = tokens.get(`r:${body.refresh_token}`);
          if (!id) { send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' }); return; }
          tokens.delete(`r:${body.refresh_token}`);
          send(res, 200, session(id)); return;
        }
        send(res, 400, { error: 'unsupported_grant_type', error_description: 'Google sign-in is not on this stage.' }); return;
      }
      if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
        if (!who) { send(res, 401, { message: 'not signed in' }); return; }
        send(res, 200, { id: who, email: emailOf(who) }); return;
      }
      if (url.pathname === '/auth/v1/logout') { if (bearer) tokens.delete(bearer); send(res, 204); return; }
      if (url.pathname === '/auth/v1/authorize') { res.writeHead(400, { 'content-type': 'text/plain' }); res.end('Google sign-in is not on this stage.'); return; }
      send(res, 404, { message: 'not on this stage' });
    } catch (err) { said(res, err); }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url, db, signUp, rpc,
    async close() { server.closeAllConnections(); await new Promise((r) => server.close(r)); await db.close(); },
  };
}

// ---- the site ----

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
};
const readHeaders = (site) => {
  const out = {};
  for (const line of fs.readFileSync(path.join(site, '_headers'), 'utf8').split('\n')) {
    const m = /^\s+([\w-]+):\s*(.+)$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
};
const routed = (patterns, p) => patterns.some((g) => new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(p));

export async function startSite({ site, port = 8788 }) {
  const headers = readHeaders(site);
  const routes = JSON.parse(fs.readFileSync(path.join(site, '_routes.json'), 'utf8'));
  const worker = (await import(`${pathToFileURL(path.join(site, '_worker.js')).href}?at=${Date.now()}`)).default;
  // As Pages answers: a file when there is one, else index.html (`_redirects`), with `_headers`.
  const assets = {
    async fetch(input) {
      const p = decodeURIComponent(new URL(typeof input === 'string' ? input : input.url ?? String(input)).pathname);
      let file = path.join(site, p);
      if (!file.startsWith(site) || !fs.existsSync(file) || fs.statSync(file).isDirectory() || path.basename(file).startsWith('_')) file = path.join(site, 'index.html');
      return new Response(fs.readFileSync(file), { headers: { ...headers, 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' } });
    },
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const request = new Request(url, { method: req.method, headers: req.headers });
      const answer = routed(routes.include, url.pathname) && !routed(routes.exclude, url.pathname)
        ? await worker.fetch(request, { ASSETS: assets })
        : await assets.fetch(request);
      res.writeHead(answer.status, Object.fromEntries(answer.headers));
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(await answer.arrayBuffer()));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(err?.stack ?? err));
    }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, async close() { server.closeAllConnections(); await new Promise((r) => server.close(r)); } };
}

export function buildStageSite(cloudUrl, { build = true } = {}) {
  if (build) {
    const made = spawnSync('npx', ['vite', 'build', 'renderer'], { cwd: root, stdio: 'inherit' });
    if (made.status !== 0) throw new Error('the renderer did not build');
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-file-stage-'));
  const configFile = path.join(tmp, 'team.config.json');
  fs.writeFileSync(configFile, JSON.stringify({ url: cloudUrl, anonKey: ANON_KEY }));
  const { out } = buildPhoneSite({ configFile, out: path.join(tmp, 'site'), localCloud: true, log: () => {} });
  return out;
}

// ---- what --seed shares ----

const DOC = `# Launch plan for the spring release

We ship the new inbox to everyone on **March 18**. This page is the plan we agreed on Tuesday, with what is left.

## What ships

- The new inbox, with threads grouped by project
- Replies from the phone, even with the computer closed
- Shared files, like this one
  - anyone with the link can read it
  - comments need an account

## Who does what

| Part | Owner | State |
| --- | --- | --- |
| Inbox | Maya | Done |
| Phone replies | Jun | In review |
| Shared files | Theo | Building |

## The one setting that changes

\`\`\`json
{
  "inbox": { "groupBy": "project", "showDone": false }
}
\`\`\`

### Before the day

1. Freeze the branch on the 14th
2. Run the full test pass
3. Write the release notes

> Keep the notes short. Nobody reads the second paragraph.

Questions go in the comments.
`;

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Pricing sketch</title>
<style>
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; background: #f6f3ee; color: #1d1b19; }
  main { max-width: 760px; margin: 0 auto; padding: 56px 32px; }
  h1 { font-size: 34px; margin: 0 0 8px; letter-spacing: -0.02em; }
  .plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 32px; }
  .plan { background: #fff; border: 1px solid #e3ddd4; padding: 22px; }
  .plan b { display: block; font-size: 28px; margin: 8px 0; }
  button { margin-top: 28px; font: inherit; padding: 10px 16px; border: 0; background: #ee6018; color: #fff; cursor: pointer; }
</style></head>
<body><main>
  <h1>Pricing sketch</h1>
  <p>Three plans, priced by seats. The numbers are a first pass.</p>
  <div class="plans">
    <div class="plan">Solo<b>$0</b>One person, your own agents.</div>
    <div class="plan">Team<b>$12</b>Per seat, shared projects.</div>
    <div class="plan">Company<b>$30</b>Per seat, admin and audit.</div>
  </div>
  <button id="count">Pressed 0 times</button>
</main>
<script>
  let n = 0;
  const b = document.getElementById('count');
  b.addEventListener('click', () => { n += 1; b.textContent = 'Pressed ' + n + ' times'; });
  document.title = 'Pricing sketch (script ran)';
</script>
</body></html>
`;

function png(w, h, paint) {
  const rows = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    rows[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      const at = y * (w * 3 + 1) + 1 + x * 3;
      rows[at] = r; rows[at + 1] = g; rows[at + 2] = b;
    }
  }
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, sum]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

// Dusk over hills: a sky going from orange to deep blue, a sun, and three ridges.
const picture = () => png(1200, 760, (x, y) => {
  const t = y / 760;
  let c = [Math.round(238 - 180 * t), Math.round(140 - 90 * t), Math.round(90 + 40 * t)];
  const dx = x - 820, dy = y - 330;
  if (dx * dx + dy * dy < 70 * 70) c = [252, 214, 160];
  const ridges = [[470, 0.006, 60, [70, 52, 74]], [540, 0.004, 50, [48, 38, 58]], [620, 0.003, 40, [30, 26, 38]]];
  for (const [base, f, amp, col] of ridges) if (y > base + Math.sin(x * f + base) * amp) c = col;
  return c;
});

function pdf() {
  const pages = [
    ['Quarterly review', 'Revenue grew 18 percent on the quarter.', 'Churn fell to 2.1 percent.', 'Hiring: two engineers, one designer.'],
    ['Next quarter', 'Ship shared files and comments.', 'Open the team plan to everyone.', 'Keep the inbox fast on old Macs.'],
  ];
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = [];
  const pagesId = objs.length + 1 + pages.length * 2;
  for (const [title, ...lines] of pages) {
    const text = [`BT /F1 28 Tf 72 720 Td (${title}) Tj ET`, ...lines.map((l, i) => `BT /F1 14 Tf 72 ${660 - i * 26} Td (${l}) Tj ET`)].join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`));
  }
  add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = '%PDF-1.4\n';
  const at = [];
  objs.forEach((o, i) => { at.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

export async function seed(db, site) {
  const maya = await db.signUp('maya@stage.test', 'maya-stage-password', 'Maya Chen');
  const sub = maya.user.id;
  const share = (src, name, kind, type, body) => db.rpc('share_file', { src, nm: name, k: kind, typ: type, b: body, v: 1, h: '' }, sub);
  const links = {
    markdown: await share('notes/launch-plan.md', 'launch-plan.md', 'markdown', 'text/markdown', DOC),
    page: await share('designs/pricing.html', 'pricing.html', 'page', 'text/html', PAGE),
    image: await share('designs/dusk.png', 'dusk.png', 'image', 'image/png', picture().toString('base64')),
    pdf: await share('reports/quarterly-review.pdf', 'quarterly-review.pdf', 'pdf', 'application/pdf', pdf().toString('base64')),
  };
  links.stopped = await share('notes/old.md', 'old.md', 'markdown', 'text/markdown', '# Old');
  await db.rpc('stop_file_link', { tok: links.stopped }, sub);
  return { maya, urls: Object.fromEntries(Object.entries(links).map(([k, t]) => [k, `${site}/f/${t}`])) };
}

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = await startDatabase({ port: Number(arg('--db-port', 54329)), log: process.argv.includes('--verbose') ? console.log : () => {} });
  const out = buildStageSite(db.url, { build: !process.argv.includes('--no-build') });
  const site = await startSite({ site: out, port: Number(arg('--site-port', 8788)) });
  console.log(`database  ${db.url}  (public key ${ANON_KEY})`);
  console.log(`site      ${site.url}  (served from ${out})`);
  if (process.argv.includes('--seed')) {
    const { urls } = await seed(db, site.url);
    for (const [k, u] of Object.entries(urls)) console.log(`${k.padEnd(9)} ${u}`);
    console.log('Maya Chen signs in as maya@stage.test / maya-stage-password');
  }
  const stop = async () => { await site.close(); await db.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
