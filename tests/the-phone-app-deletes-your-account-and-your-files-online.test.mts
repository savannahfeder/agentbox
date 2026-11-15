// THE PHONE APP DELETES YOUR ACCOUNT AND YOUR FILES ONLINE.
//
// App Review (guideline 5.1.1(v)) wants an account made in the app deletable
// from inside it, and nothing did that (2026-10-23). The database side is
// delete_my_account() (tests/deleting-your-account-takes-what-you-wrote-and-
// leaves-your-team-whole). Files in storage cannot be deleted from SQL, so the
// app removes them first through the storage API, every folder under your own
// (one per computer), and only then deletes the account. If the files cannot
// go, the account is kept and the app says so, rather than leaving files no
// one can reach.
import { describe, it, expect } from 'vitest';
import { cloudClient } from '../renderer/src/cloud-rest';
import { deleteAccount } from '../renderer/src/phone-account';

const ME = 'p-me';
const session = { access_token: 't', refresh_token: 'r', expires_at: Date.now() + 3600_000, user: { id: ME, email: 'me@example.com' } };
const store = () => { const m = new Map([['agentbox-cloud-session', JSON.stringify(session)]]); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

function cloud({ files = { [`${ME}/dev1/`]: ['a.png', 'b.mp4'], [`${ME}/dev2/`]: ['c.png'] }, failRemove = false } = {}) {
  const asked = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    asked.push({ method: init.method ?? 'GET', path: u.pathname, body });
    if (u.pathname === '/storage/v1/object/list/phone-files') {
      const prefix = body.prefix;
      const listed = prefix === `${ME}/` ? Object.keys(files).map((k) => ({ name: k.split('/')[1], id: null })) : (files[prefix] ?? []).map((n) => ({ name: n, id: `id-${n}` }));
      return new Response(JSON.stringify(listed.slice(body.offset, body.offset + body.limit)), { status: 200 });
    }
    if (u.pathname === '/storage/v1/object/phone-files' && init.method === 'DELETE') {
      return failRemove ? new Response(JSON.stringify({ message: 'nope' }), { status: 500 }) : new Response('[]', { status: 200 });
    }
    return new Response('null', { status: 200 });
  };
  return { asked, c: cloudClient({ url: 'https://cloud.example', anonKey: 'k' }, { storage: store(), fetchImpl }) };
}

describe('deleting your account from the phone', () => {
  it('removes every file under your own folder, then deletes the account, then signs out', async () => {
    const { c, asked } = cloud();
    await deleteAccount(c);
    const removed = asked.find((a) => a.method === 'DELETE');
    expect(removed.body.prefixes.sort()).toEqual([`${ME}/dev1/a.png`, `${ME}/dev1/b.mp4`, `${ME}/dev2/c.png`]);
    const order = asked.map((a) => a.path);
    expect(order.indexOf('/rest/v1/rpc/delete_my_account')).toBeGreaterThan(order.indexOf('/storage/v1/object/phone-files'));
    expect(c.signedIn()).toBe(false);
  });

  it('with no files online, deletes the account all the same', async () => {
    const { c, asked } = cloud({ files: {} });
    await deleteAccount(c);
    expect(asked.some((a) => a.method === 'DELETE')).toBe(false);
    expect(asked.some((a) => a.path === '/rest/v1/rpc/delete_my_account')).toBe(true);
  });

  it('keeps the account, and says so, when the files cannot go', async () => {
    const { c, asked } = cloud({ failRemove: true });
    await expect(deleteAccount(c)).rejects.toThrow('Your files online could not be deleted, so your account was kept. Try again.');
    expect(asked.some((a) => a.path === '/rest/v1/rpc/delete_my_account')).toBe(false);
    expect(c.signedIn()).toBe(true);
  });

  it('never lists or removes outside your own folder', async () => {
    const { c, asked } = cloud();
    await deleteAccount(c);
    for (const a of asked.filter((x) => x.path.startsWith('/storage/'))) {
      for (const p of [a.body?.prefix, ...(a.body?.prefixes ?? [])].filter(Boolean)) expect(p.startsWith(`${ME}/`)).toBe(true);
    }
  });
});
