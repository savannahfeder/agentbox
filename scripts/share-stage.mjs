// SHARING BETWEEN PEOPLE, ON THIS COMPUTER: copies of the app signed in to one
// stand-in team cloud, sharing files by link, with the real link page.
//
//   node scripts/share-stage.mjs [--no-build] [--dir /tmp/share-stage]
//
//   54900  the stand-in team cloud (cloud/standin/server.mjs). A copy signs in
//          with live.mjs up --team <dir>/<name>.json, a file { config, email,
//          password } this writes for whoever is named in --people.
//   54902  a database-shaped door over that same cloud, for the link page
//   54901  the link page, as scripts/build-phone-site.mjs writes it
//
// scripts/shared-file-stage.mjs is the link page alone, on a database of its
// own; this one is for power testers and pictures where the person who shares
// and the person who opens are both in the app.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { startStandinCloud } from '../cloud/standin/server.mjs';
import { memoryBackend, signUpMemory } from '../main/team/memory-cloud.mts';
import { buildStageSite, startSite } from './shared-file-stage.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const DIR = arg('dir', '/tmp/share-stage');
const PEOPLE = String(arg('people', 'maya,jun')).split(',').filter(Boolean);
fs.mkdirSync(DIR, { recursive: true });

const team = await startStandinCloud({ port: 54900, file: path.join(DIR, 'cloud.json') });
const { cloud } = team;
const iso = (ms) => new Date(ms || Date.now()).toISOString();
const NOBODY = 'nobody-reading-a-link';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'apikey, authorization, content-type, prefer, x-client-info, x-upsert',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};
const send = (res, status, body) => { res.writeHead(status, { ...cors, 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
// A person's token is their id, as the stand-in team cloud's own is.
const session = (p) => ({ access_token: p.id, refresh_token: p.id, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: p.id, email: p.email } });
const byEmail = (email) => [...cloud.people.values()].find((p) => p.email === String(email ?? '').trim().toLowerCase());
const nameOf = (email) => { const s = String(email).split('@')[0]; return s[0].toUpperCase() + s.slice(1); };

// The database functions the link page calls, answered from the memory cloud.
const rpcs = {
  async file_link_view(b, { tok }) {
    const { file } = await b.fileLinkView(String(tok));
    return file ? [{ name: file.name, kind: file.kind, type: file.type, body: file.body, version: file.version, created_at: iso(file.createdAt), updated_at: iso(file.updatedAt), owner_name: file.ownerName, owner_avatar: file.ownerAvatar, mine: file.mine }] : [];
  },
  async file_link_stopped(b, { tok }) { return (await b.fileLinkView(String(tok))).stopped; },
  async file_link_comments_of(b, { tok }) {
    return (await b.fileLinkComments(String(tok))).map((c) => ({ id: c.id, by_name: c.byName, by_avatar: c.byAvatar, body: c.text, created_at: iso(c.at), mine: c.mine, by_owner: c.byOwner, place: c.place ?? null }));
  },
  async comment_on_file_link(b, { tok, b: words, p }, who) {
    if (!who) throw Object.assign(new Error('sign in to comment'), { status: 401 });
    return b.commentOnFileLink(String(tok), words, p ?? null);
  },
  async remove_file_link_comment(b, { c }, who) {
    if (!who) throw Object.assign(new Error('sign in first'), { status: 401 });
    await b.removeFileLinkComment(String(c));
    return null;
  },
};

const door = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  const url = new URL(req.url, 'http://127.0.0.1');
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* a storage read has none */ }
  const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? null;
  const who = bearer && cloud.people.has(bearer) ? bearer : null;
  try {
    if (url.pathname === '/auth/v1/token') {
      const p = url.searchParams.get('grant_type') === 'password' ? byEmail(body.email) : cloud.people.get(body.refresh_token);
      if (!p) { send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }); return; }
      send(res, 200, session(p)); return;
    }
    if (url.pathname === '/auth/v1/signup') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const id = byEmail(email)?.id ?? signUpMemory(cloud, { email, name: body.data?.full_name || nameOf(email) });
      send(res, 200, session(cloud.people.get(id))); return;
    }
    if (url.pathname === '/auth/v1/user') { const p = who && cloud.people.get(who); send(res, p ? 200 : 401, p ? { id: p.id, email: p.email } : { message: 'not signed in' }); return; }
    if (url.pathname === '/auth/v1/logout') { send(res, 204); return; }
    const b = memoryBackend(cloud, who ?? NOBODY);
    const m = /^\/rest\/v1\/rpc\/([^/]+)$/.exec(url.pathname);
    if (m) {
      const fn = rpcs[m[1]];
      if (!fn) { send(res, 404, { message: `no function ${m[1]} on this stage` }); return; }
      send(res, 200, await fn(b, body, who)); return;
    }
    const s = /^\/storage\/v1\/object\/link-files\/(.+)$/.exec(url.pathname);
    if (s && req.method === 'GET') {
      const got = await b.linkPiece(s[1].split('/').map(decodeURIComponent).join('/'));
      if (!got) { send(res, 400, { message: 'Object not found' }); return; }
      res.writeHead(200, { ...cors, 'content-type': 'application/octet-stream', 'content-length': got.length }); res.end(got); return;
    }
    send(res, 404, { message: `nothing at ${url.pathname} on this stage` });
  } catch (err) {
    send(res, err.status ?? 400, { message: String(err.message ?? err), msg: String(err.message ?? err) });
  }
});
await new Promise((r) => door.listen(54902, '127.0.0.1', r));

const site = await startSite({ site: buildStageSite('http://127.0.0.1:54902', { build: !process.argv.includes('--no-build') }), port: 54901 });
const config = path.join(DIR, 'standin.json');
fs.writeFileSync(config, JSON.stringify({ url: team.url, anonKey: 'stage-anon-key-0123456789', standin: true, phoneSite: site.url }));
for (const who of PEOPLE) fs.writeFileSync(path.join(DIR, `${who}.json`), JSON.stringify({ config, email: `${who}@lumen.test`, password: 'x' }), { mode: 0o600 });
// `--seed <folder>`: Priya, from another company, shares every file in it, and
// Jun leaves comments at places in them. Their links go in <dir>/links.txt.
const seedFrom = arg('seed', null);
if (seedFrom) {
  const { fileForLink, filmPiece } = await import('../main/file-link.mts');
  const priya = memoryBackend(cloud, byEmail('priya@northwind.test')?.id ?? signUpMemory(cloud, { email: 'priya@northwind.test', name: 'Priya Shah' }));
  const jun = memoryBackend(cloud, byEmail('jun@lumen.test')?.id ?? signUpMemory(cloud, { email: 'jun@lumen.test', name: 'Jun' }));
  const links = [];
  for (const name of fs.readdirSync(seedFrom).sort()) {
    const f = fileForLink(path.join(seedFrom, name));
    if (f.error) { console.error(`${name}: ${f.error}`); continue; }
    const token = await priya.shareFile({ source: `northwind/w-seed/${name}`, name, kind: f.kind, type: f.type, body: f.body, version: 1, hash: f.hash });
    if (f.kind === 'video') for (let n = 0; n < JSON.parse(f.body).pieces; n++) await priya.putLinkPiece(`${token}/${f.hash}/${n}`, filmPiece(f.path, n));
    const said = {
      video: [['The cut here is too fast', { kind: 'time', s: 3.2 }], ['This logo looks soft on a big screen', { kind: 'time', s: 6.5, x: 0.52, y: 0.45 }], ['Love the ending', null]],
      image: [['Can this be a little darker?', { kind: 'pin', x: 0.3, y: 0.4 }]],
      markdown: [['Is Tuesday still the date?', { kind: 'quote', text: 'starting the 17th' }], ['Looks good to me', null]],
    }[f.kind] ?? [];
    for (const [words, place] of said) await jun.commentOnFileLink(token, words, place);
    links.push(`${site.url}/f/${token}   ${name}`);
  }
  fs.writeFileSync(path.join(DIR, 'links.txt'), `${links.join('\n')}\n`);
}
console.log(JSON.stringify({ team: team.url, door: 'http://127.0.0.1:54902', site: site.url, config, people: PEOPLE.map((p) => path.join(DIR, `${p}.json`)) }));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { await team.stop(); await site.close(); door.close(); process.exit(0); });
