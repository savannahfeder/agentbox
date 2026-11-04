#!/usr/bin/env node
// A TOOL TO CONNECT TO, ON THIS MACHINE, THAT BREAKS ON REQUEST.
//
//   node cloud/standin/tools-mcp.mjs --port 55271
//   curl -X POST http://127.0.0.1:55271/__switches -d '{"revoked":true}'
//
// A plain HTTP MCP server with OAuth (dynamic registration, PKCE, a loopback
// redirect) over Lumen's sample issues and pages. It plays no vendor. It trusts
// loopback only, and its catalog entry appears only under AGENTBOX_TOOLS_FIXTURE
// (shared/connections-catalog.mjs), so no installed build can reach it.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const FIXTURE_NAME = 'Test tracker';
export const READ_TOOLS = ['list_issues', 'get_issue', 'search_pages', 'get_page'];
export const WRITE_TOOLS = ['create_issue'];

const ISSUES = [
  { id: 'LUM-41', title: 'Group bookings: a clinic can hold a block of six', state: 'In progress', assignee: 'Dev', body: 'Launch in two weeks. Waitlist clinics asked for this first.' },
  { id: 'LUM-44', title: 'New onboarding drops people at the calendar step', state: 'Todo', assignee: 'Sofia', body: 'Three of six clinics stalled there.' },
  { id: 'LUM-47', title: 'Reminder texts go out twice on daylight saving day', state: 'Todo', assignee: 'Dev', body: 'Reported by one clinic, twice.' },
];
const PAGES = [
  { id: 'launch-plan', title: 'Launch plan for group bookings', body: 'Two weeks out. Six paying clinics first, then the waitlist of 40.' },
  { id: 'onboarding-notes', title: 'Onboarding notes', body: 'What each clinic asked in its first call.' },
];

const schema = (properties = {}, required = []) => ({ type: 'object', properties, required });
const TOOLS = [
  { name: 'list_issues', description: 'List open issues.', inputSchema: schema({ limit: { type: 'number' } }) },
  { name: 'get_issue', description: 'Read one issue by id.', inputSchema: schema({ id: { type: 'string' } }, ['id']) },
  { name: 'search_pages', description: 'Search pages by words in their title or body.', inputSchema: schema({ query: { type: 'string' } }) },
  { name: 'get_page', description: 'Read one page by id.', inputSchema: schema({ id: { type: 'string' } }, ['id']) },
  { name: 'create_issue', description: 'Create a new issue.', inputSchema: schema({ title: { type: 'string' }, body: { type: 'string' } }, ['title']) },
  { name: 'export_workspace', description: 'Export the whole workspace.', inputSchema: schema() },
];
const SURPRISE = { name: 'list_everything', description: 'A tool that was not here when you connected.', inputSchema: schema() };

const SHA = (s) => crypto.createHash('sha256').update(s).digest('base64url');
const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });

const CONSENT = (query, name, askedFor = 'read your issues and pages') => `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title>
<style>body{font:15px -apple-system,system-ui,sans-serif;background:#f6f6f4;color:#222;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
main{background:#fff;border:1px solid #ddd;border-radius:12px;padding:28px 32px;width:340px}h1{font-size:18px;font-weight:600;margin:0 0 8px}p{margin:0 0 20px;color:#555;line-height:1.45}
button{font:inherit;padding:8px 18px;border-radius:8px;border:1px solid #222;background:#222;color:#fff}</style></head>
<body><main><h1>${name}</h1><p>Agentbox would like to ${askedFor}, and ask before it changes anything.</p>
<form method="post" action="/authorize?${query}"><button name="allow" value="1">Allow</button></form></main></body></html>`;

/**
 * `play` makes it another tool (scripts/standin-tools.mjs): its name, tools and
 * data. `play.registered` is a vendor with no self-registration, which takes only
 * a client made in its own console, with a secret and that client's exact address.
 * `play.keys` are tokens it takes as they are, as a personal access token is.
 */
export async function startToolsFixture({ port = 0, play = null, stateFile = null } = {}) {
  const name = play?.name ?? FIXTURE_NAME;
  const registered = play?.registered ?? null;
  const switches = { expired: false, revoked: false, down: false, errors: false, forbidden: false, slowMs: 0, slowWriteMs: 0, empty: false, changed: false, notMcp: false, noListIssues: false };
  const keys = new Set(play?.keys ?? []);
  const clients = new Map();
  const codes = new Map();
  const access = new Map();
  const refresh = new Map();
  const writes = [];
  const calls = [];
  const tokensEverIssued = [];
  const issues = [...ISSUES];
  let url = '';

  // A restart must not read as everybody's sign-in being revoked: it once did.
  const remember = () => {
    if (!stateFile) return;
    fs.writeFileSync(stateFile, JSON.stringify({ clients: [...clients], access: [...access], refresh: [...refresh], issues: issues.slice(ISSUES.length) }), { mode: 0o600 });
  };
  try {
    const had = stateFile ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
    for (const [k, v] of had?.clients ?? []) clients.set(k, v);
    for (const [k, v] of had?.access ?? []) access.set(k, v);
    for (const [k, v] of had?.refresh ?? []) refresh.set(k, v);
    issues.push(...(had?.issues ?? []));
  } catch { /* first start */ }

  const issue = () => {
    const a = crypto.randomBytes(24).toString('base64url');
    const r = crypto.randomBytes(24).toString('base64url');
    access.set(a, { born: Date.now() });
    if (!play?.noRefresh) refresh.set(r, true);
    tokensEverIssued.push(a, ...(play?.noRefresh ? [] : [r]));
    remember();
    return { access_token: a, ...(play?.noRefresh ? {} : { refresh_token: r }), token_type: 'Bearer', expires_in: 3600 };
  };

  function call(name, args = {}) {
    calls.push(name);
    if (play) return play.call(name, args, { switches, writes, text });
    if (name === 'list_issues') return text(switches.empty ? [] : issues.slice(0, Number(args.limit) || issues.length).map(({ body: _b, ...i }) => i));
    if (name === 'get_issue') { const i = issues.find((x) => x.id === args.id); return i ? text(i) : { isError: true, ...text(`No issue ${args.id}`) }; }
    if (name === 'search_pages') { const q = String(args.query ?? '').toLowerCase(); return text(switches.empty ? [] : PAGES.filter((p) => `${p.title} ${p.body}`.toLowerCase().includes(q)).map(({ id, title }) => ({ id, title }))); }
    if (name === 'get_page') { const p = PAGES.find((x) => x.id === args.id); return p ? text(p) : { isError: true, ...text(`No page ${args.id}`) }; }
    if (name === 'create_issue') { const made = { id: `LUM-${50 + writes.length}`, title: String(args.title), state: 'Todo', assignee: null, body: String(args.body ?? '') }; writes.push(made); issues.push(made); return text(made); }
    if (name === 'export_workspace') return text({ issues, pages: PAGES });
    if (name === 'list_everything') return text('everything');
    return { isError: true, ...text(`No tool ${name}`) };
  }

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');

    // The switches answer even when the server is "down", or it could not come back.
    if (u.pathname === '/__switches') {
      if (req.method === 'POST') Object.assign(switches, JSON.parse(raw || '{}'));
      return send(200, { switches, writes });
    }
    if (switches.down) { req.socket.destroy(); return; }
    if (switches.slowMs) await new Promise((r) => setTimeout(r, switches.slowMs));
    if (switches.errors) return send(500, { error: 'server_error' });

    if (u.pathname.startsWith('/.well-known/oauth-protected-resource')) {
      return send(200, { resource: `${url}/mcp`, authorization_servers: [url], bearer_methods_supported: ['header'] });
    }
    if (u.pathname.startsWith('/.well-known/oauth-authorization-server')) {
      return send(200, {
        issuer: url, authorization_endpoint: `${url}/authorize`, token_endpoint: `${url}/token`, ...(registered ? {} : { registration_endpoint: `${url}/register` }),
        response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: registered ? ['client_secret_post'] : ['none'],
      });
    }
    if (u.pathname === '/register' && req.method === 'POST' && !registered) {
      const body = JSON.parse(raw || '{}');
      const id = crypto.randomUUID();
      clients.set(id, { redirectUris: body.redirect_uris ?? [] });
      remember();
      return send(201, { client_id: id, redirect_uris: body.redirect_uris ?? [], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] });
    }
    if (u.pathname === '/authorize') {
      const client = registered
        ? (u.searchParams.get('client_id') === registered.clientId ? { redirectUris: registered.redirects } : null)
        : clients.get(u.searchParams.get('client_id'));
      const redirect = u.searchParams.get('redirect_uri');
      if (!client || !client.redirectUris.includes(redirect)) return send(400, { error: 'invalid_client' });
      if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(CONSENT(u.searchParams.toString().replace(/&/g, '&amp;'), name, play?.askedFor)); }
      const code = crypto.randomBytes(16).toString('base64url');
      codes.set(code, { client: u.searchParams.get('client_id'), redirect, challenge: u.searchParams.get('code_challenge') });
      const back = new URL(redirect);
      back.searchParams.set('code', code);
      if (u.searchParams.get('state')) back.searchParams.set('state', u.searchParams.get('state'));
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }
    if (u.pathname === '/token' && req.method === 'POST') {
      const f = new URLSearchParams(raw);
      if (registered && (f.get('client_id') !== registered.clientId || f.get('client_secret') !== registered.clientSecret)) return send(401, { error: 'invalid_client' });
      if (f.get('grant_type') === 'authorization_code') {
        const c = codes.get(f.get('code'));
        codes.delete(f.get('code'));
        if (!c || c.client !== f.get('client_id') || c.redirect !== f.get('redirect_uri') || SHA(f.get('code_verifier') ?? '') !== c.challenge) return send(400, { error: 'invalid_grant' });
        return send(200, issue());
      }
      if (f.get('grant_type') === 'refresh_token') {
        if (switches.revoked || !refresh.has(f.get('refresh_token'))) return send(400, { error: 'invalid_grant' });
        refresh.delete(f.get('refresh_token'));
        switches.expired = false;
        return send(200, issue());
      }
      return send(400, { error: 'unsupported_grant_type' });
    }
    if (u.pathname === '/mcp') {
      if (req.method === 'DELETE') return send(200, {});
      if (req.method !== 'POST') return send(405, { error: 'method not allowed' });
      const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
      if (!token || !(access.has(token) || keys.has(token)) || switches.revoked || switches.expired) {
        return send(401, { error: 'invalid_token' }, { 'www-authenticate': `Bearer resource_metadata="${url}/.well-known/oauth-protected-resource"` });
      }
      if (switches.forbidden) return send(403, { error: 'insufficient_scope' });
      // A web page where the tools should be, as a moved or retired address answers.
      if (switches.notMcp) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>Moved</title><p>This page has moved.</p>'); }
      const msg = JSON.parse(raw || '{}');
      if (msg.id === undefined) { res.writeHead(202); return res.end(); }
      const reply = (result) => send(200, { jsonrpc: '2.0', id: msg.id, result });
      if (msg.method === 'initialize') return reply({ protocolVersion: msg.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name, version: '1.0.0' } });
      if (msg.method === 'ping') return reply({});
      if (msg.method === 'tools/list') {
        if (play) return reply({ tools: switches.changed ? [...play.tools, SURPRISE] : play.tools });
        const tools = switches.changed ? [...TOOLS, SURPRISE] : TOOLS;
        return reply({ tools: switches.noListIssues ? tools.filter((t) => t.name !== 'list_issues') : tools });
      }
      if (msg.method === 'tools/call') {
        const made = call(msg.params?.name, msg.params?.arguments);
        // The write has happened by now, the way a slow real one has when its answer gets lost.
        if (switches.slowWriteMs && WRITE_TOOLS.includes(msg.params?.name)) await new Promise((r) => setTimeout(r, switches.slowWriteMs));
        return reply(made);
      }
      return send(200, { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'no such method' } });
    }
    return send(404, { error: 'not found' });
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  return {
    url, mcpUrl: `${url}/mcp`, port: server.address().port, switches, writes, calls, tokensEverIssued,
    stop: () => new Promise((done) => { server.closeAllConnections?.(); server.close(() => done()); }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--port');
  const s = process.argv.indexOf('--state');
  const started = await startToolsFixture({ port: i > 0 ? Number(process.argv[i + 1]) : 55271, stateFile: s > 0 ? process.argv[s + 1] : null });
  console.log(`${FIXTURE_NAME} on ${started.mcpUrl}`);
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => started.stop().then(() => process.exit(0)));
}
