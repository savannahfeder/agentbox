// A WORKER CAN LOOK AT THE PAGE IT JUST BUILT, AND AT NOTHING ELSE.
//
// MP-09 of the parity project (w-5ebf7bf7bb). The terminal clients this app is
// keeping parity with mostly ship a browser. The rule: a worker driving a
// browser of ours is fine, and a worker driving the browser the user is signed
// into is never allowed, because that one holds their logins, their cookies and
// everything else.
//
// The app has no browser pane of its own, so this is the smallest honest
// version of the approved design.
// A worker starts its app, opens the local address, and gets a picture it can
// put on the row, out of a headless browser that holds nothing.
//
// LOOPBACK ONLY, AND THAT IS THE SECURITY RATHER THAN A SETTING. A worker that
// can fetch any address can post anything it has read to any address, and no
// per-run approval makes that legible. An address that cannot leave the machine
// bounds the capability by what it can reach. Widening it is a separate
// permission design, and the user's decision to make.
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localTarget, findChrome, lookAtPage } from '../mcp/core/page.mjs';
import { envName } from '../shared/product-name.mjs';

const dirs = [];
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

/** A store on disk shaped the way resolveProduct expects to find one. */
function store() {
  const root = mkdtempSync(join(tmpdir(), 'zero-look-'));
  dirs.push(root);
  const account = join(root, 'accounts', 'acct-1');
  const dir = join(account, 'astral');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'project.json'), JSON.stringify({ name: 'Astral' }));
  // The store root and the account this server may write to, named the way the
  // app names its own environment.
  process.env[envName('HOME')] = root;
  process.env.STORE_ACCOUNT_ID = 'acct-1';
  return { root, dir };
}

describe('the address a worker may open', () => {
  it('is loopback, however it is spelled', () => {
    expect(localTarget('http://localhost:3000/')).toBe('http://localhost:3000/');
    expect(localTarget('http://127.0.0.1:5173/inbox')).toBe('http://127.0.0.1:5173/inbox');
    expect(localTarget('https://localhost:8443/')).toBe('https://localhost:8443/');
  });

  it('is never the open web, and the refusal says why', () => {
    expect(() => localTarget('https://example.com/')).toThrow(/only a local address/i);
    expect(() => localTarget('https://mail.google.com/')).toThrow(/permission decision/i);
    // A host that merely looks local is not local.
    expect(() => localTarget('http://localhost.evil.com/')).toThrow(/only a local address/i);
  });

  it('is never a scheme that reads the disk or runs something', () => {
    expect(() => localTarget('file:///Users/you/.ssh/id_rsa')).toThrow(/only http and https/i);
    expect(() => localTarget('data:text/html,<script>')).toThrow(/only http and https/i);
    expect(() => localTarget('not a url at all')).toThrow(/not a url/i);
  });
});

describe('looking at the page', () => {
  it('saves the picture into the product and hands back what it says', async () => {
    const { dir } = store();
    const out = await lookAtPage({
      product: 'astral',
      url: 'http://localhost:4173/',
      now: () => Date.parse('2026-09-23T18:30:00Z'),
      capture: async ({ url }) => ({ png: Buffer.from('a picture'), title: 'North Sound', text: `hello from ${url}` }),
    });
    expect(out.picture).toBe('attachments/page-2026-09-23T18-30-00-000Z.png');
    expect(existsSync(join(dir, out.picture))).toBe(true);
    expect(readFileSync(join(dir, out.picture), 'utf8')).toBe('a picture');
    expect(out.title).toBe('North Sound');
    expect(out.text).toContain('hello from http://localhost:4173/');
  });

  it('refuses before it opens anything when the address is not local', async () => {
    store();
    let opened = false;
    await expect(lookAtPage({
      product: 'astral',
      url: 'https://example.com',
      capture: async () => { opened = true; return { png: Buffer.from('x') }; },
    })).rejects.toThrow(/only a local address/i);
    expect(opened).toBe(false);
  });

  it('says plainly when the machine has no browser to open it with', async () => {
    store();
    await expect(lookAtPage({
      product: 'astral',
      url: 'http://localhost:3000',
      capture: async () => ({ error: 'No Chrome, Chromium or Edge on this computer, so there is nothing to open the page with.' }),
    })).rejects.toThrow(/no chrome/i);
  });

  // Not a claim that a browser exists here, only that the lookup is honest
  // about what it found. The suite must pass on a machine with none.
  it('looks for a browser in the usual places and does not invent one', () => {
    expect(findChrome(['/nowhere/at/all'])).toBe(null);
    const found = findChrome();
    expect(found === null || typeof found === 'string').toBe(true);
  });
});
