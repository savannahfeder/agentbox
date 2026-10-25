// A CLOUD LOGIN SAYS WHOSE IT IS AND HOW MUCH OF IT IS LEFT.
//
// What broke (2026-10-16): Settings named the cloud's two Claude logins
// "Claude account 1" and "Claude account 2" with no usage, so nobody could
// tell which subscription a cloud run would spend. The sign-in asked
// Anthropic's profile endpoint for the email, and a `claude setup-token`
// token is granted user:inference only, so the answer was always empty.
// Measured the same day on Claude Code 2.1.302: one `claude -p` under
// ANTHROPIC_LOG=debug printed the reply's anthropic-organization-id (it
// matched the work login's organizationUuid in its .claude.json) and its
// unified 5h and 7d utilization and reset.
//
// The fix: the cloud reads those headers off one tiny reply, at sign-in and
// whenever the Mac asks to look, and never logs the output they came in,
// which also carries the request and its token. The Mac names a cloud login
// by the one login of its own in the same organization.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createSandbox, pickBaseEnv, readReplyHeaders } from '../cloud/sandbox/server.mjs';
import { TOKEN, ORG } from './fixtures/cloud/fake-vendor-cli.mjs';
import { cloudLoginFor, lookAtCloudLogin, recordCloudLogin } from '../main/cloud/logins.mjs';
import { nameForOrganization } from '../main/account-tooling.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const FAKE = fileURLToPath(new URL('./fixtures/cloud/fake-vendor-cli.mjs', import.meta.url));

describe('reading a reply’s headers', () => {
  const line = (five, week, org = 'org-1') => `{ "anthropic-organization-id": "${org}", "anthropic-ratelimit-unified-5h-utilization": "${five}", "anthropic-ratelimit-unified-5h-reset": "1792206000", "anthropic-ratelimit-unified-7d-utilization": "${week}", "anthropic-ratelimit-unified-7d-reset": "1792710000" }`;

  it('her case: the organization, 36% of the session and 14% of the week, with when each resets', () => {
    expect(readReplyHeaders(line('0.36', '0.14'))).toEqual({
      org: 'org-1',
      limits: [
        { span: 'session', percent: 36, resetsAt: 1792206000_000 },
        { span: 'week', percent: 14, resetsAt: 1792710000_000 },
      ],
    });
  });

  it('the newest reply wins when there were several', () => {
    expect(readReplyHeaders(`${line('0.30', '0.10')}\n${line('0.36', '0.14')}`).limits[0].percent).toBe(36);
  });

  it('a full session reads 100', () => {
    expect(readReplyHeaders(line('1.0', '0.2')).limits[0].percent).toBe(100);
  });

  it('must NOT invent anything from output with no headers in it', () => {
    expect(readReplyHeaders('ok\n')).toBeNull();
    expect(readReplyHeaders(`Bearer ${TOKEN}`)).toBeNull();
  });
});

describe('the cloud machine', () => {
  let tmp; let files; let fileServer; let base; let sandbox; let logged;

  beforeEach(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-look-')));
    files = new Map();
    fileServer = http.createServer((req, res) => {
      if (req.method === 'GET') {
        const body = files.get(req.url);
        if (!body) { res.writeHead(404); return res.end(); }
        res.writeHead(200); return res.end(body);
      }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => { files.set(req.url, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
    });
    await new Promise((r) => fileServer.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${fileServer.address().port}`;
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" claude "$@"\n`, { mode: 0o755 });
    logged = [];
    sandbox = createSandbox({
      workRoot: path.join(tmp, 'vm-work'),
      pathRoot: path.join(tmp, 'vm'),
      bridgeSocket: path.join(tmp, 'bridge.sock'),
      baseEnv: { ...pickBaseEnv(process.env), PATH: `${bin}:${process.env.PATH}` },
      terminal: (l) => ['sh', '-c', l], whoIs: async () => null,
      log: (s) => logged.push(String(s)),
      uploadRetryMs: 10,
    });
  });

  afterEach(async () => {
    await sandbox?.close();
    fileServer.closeAllConnections();
    await new Promise((r) => fileServer.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const ended = async (runId) => {
    const end = Date.now() + 15_000;
    for (;;) {
      const { events } = await sandbox.handle({ action: 'events', runId, since: 0, maxBytes: 8 << 20 });
      const last = (events || []).filter((e) => e.kind === 'signin' && (e.state === 'saved' || e.state === 'failed')).pop();
      if (last) return { last, events };
      if (Date.now() > end) throw new Error('the look never ended');
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  it('looks at a saved login and says its organization and usage', async () => {
    files.set('/login', Buffer.from(JSON.stringify({ engine: 'claude', token: TOKEN })));
    expect((await sandbox.handle({ action: 'look', runId: 'look-1', engine: 'claude', loginUrl: `${base}/login` })).ok).toBe(true);
    const { last, events } = await ended('look-1');
    expect(last.state).toBe('saved');
    expect(last.org).toBe(ORG);
    expect(last.limits.map((l) => l.percent)).toEqual([36, 14]);
    // The debug output carried the token; none of it reaches a log or an event.
    expect(JSON.stringify(events)).not.toContain(TOKEN.slice(14));
    expect(logged.join('\n')).not.toContain(TOKEN.slice(14));
  });

  it('a login that cannot be fetched fails, and says nothing about whose it is', async () => {
    await sandbox.handle({ action: 'look', runId: 'look-2', engine: 'claude', loginUrl: `${base}/nothing-here` });
    const { last } = await ended('look-2');
    expect(last.state).toBe('failed');
    expect(last.org).toBeUndefined();
  });

  it('must NOT look at a Codex login: there is nothing to read', async () => {
    const out = await sandbox.handle({ action: 'look', runId: 'look-3', engine: 'codex', loginUrl: `${base}/login` });
    expect(out.ok).toBe(false);
  });
});

describe('on the Mac', () => {
  let home;
  beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-look-mac-')); });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  const transportSaying = (event) => ({
    invoke: async (_id, p) => (p.action === 'events' ? { ok: true, events: [{ seq: 1, kind: 'signin', ...event }] } : { ok: true }),
    stop: async () => {},
  });
  const storage = { getUrl: async () => 'https://example.test/login', putUrl: async () => 'https://example.test/put' };

  it('keeps what the cloud read on the login’s note', async () => {
    recordCloudLogin('claude', 'acct-1', { id: 'id-1' }, { home });
    const limits = [{ span: 'session', percent: 36, resetsAt: 1 }];
    const out = await lookAtCloudLogin({ transport: transportSaying({ state: 'saved', org: ORG, limits }), storage, key: 'acct-1', home, now: 5_000 });
    expect(out).toBe('read');
    expect(cloudLoginFor('claude', 'acct-1', { home })).toMatchObject({ org: ORG, limits, readAt: 5_000 });
  });

  it('a look that fails leaves the note as it was', async () => {
    recordCloudLogin('claude', 'acct-1', { id: 'id-1' }, { home });
    await lookAtCloudLogin({ transport: transportSaying({ state: 'failed' }), storage, key: 'acct-1', home });
    expect(cloudLoginFor('claude', 'acct-1', { home }).org).toBeUndefined();
  });

  it('names an organization by the one login here that is in it', () => {
    const ids = [{ email: 'work@example.test', organizationUuid: 'org-w' }, { email: 'me@example.test', organizationUuid: 'org-p' }];
    expect(nameForOrganization('org-w', ids)).toBe('work@example.test');
  });

  it('must NOT guess when two logins here share the organization, or none is in it', () => {
    const ids = [{ email: 'a@example.test', organizationUuid: 'org-t' }, { email: 'b@example.test', organizationUuid: 'org-t' }];
    expect(nameForOrganization('org-t', ids)).toBeNull();
    expect(nameForOrganization('org-x', ids)).toBeNull();
    expect(nameForOrganization(null, ids)).toBeNull();
  });

  it('her case, end to end: the cloud login in the work organization is named by the work email, with its meters', () => {
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'work@example.test', accountUuid: 'a-w', organizationUuid: ORG } }));
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: ORG, limits: [{ span: 'session', percent: 36, resetsAt: 1792206000_000 }, { span: 'week', percent: 14, resetsAt: null }] }, { home });
    recordCloudLogin('claude', 'acct-2', { id: 'id-2', org: 'org-elsewhere' }, { home });
    const sup = new Supervisor({ home, storeRoot: home, maxConcurrentSessions: 1, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [] }, '/nonexistent-app');
    const [one, two] = sup._cloudAccounts();
    expect(one.name).toBe('work@example.test');
    expect(one.limits.map((l) => [l.span, l.percent])).toEqual([['session', 36], ['week', 14]]);
    expect(two.name).toBeNull();
    expect(two.limits).toBeNull();
  });

  it('two folders holding the same login are one name, not a tie', () => {
    const ids = [{ email: 'me@example.test', organizationUuid: 'org-p' }, { email: 'me@example.test', organizationUuid: 'org-p' }];
    expect(nameForOrganization('org-p', ids)).toBe('me@example.test');
  });
});
