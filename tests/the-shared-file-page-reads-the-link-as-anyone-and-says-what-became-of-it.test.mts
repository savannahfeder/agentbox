// THE SHARED FILE'S PAGE READS THE LINK AS ANYONE, AND SAYS WHAT BECAME OF IT.
//
// Asked for 2026-11-03 (w-d7e61eb261). The page at /f/<token> is read by
// people who are not signed in, and renderer/src/cloud-rest.ts refused every
// database call without a session ("not signed in"), so the page could not
// read the very link it was opened for. Measured on renderer/src/shared-file/
// against a stand-in rpc and a stand-in fetch: what each answer becomes on
// screen (a file, a stopped link, a link that never was), the calls a comment
// makes, how a sign-in that comes back to the page is finished, and the words
// a refusal is shown in.
import { describe, it, expect } from 'vitest';
import {
  readSharedFile, readComments, postComment, removeComment, fileBytes, sharedLine, commentWhen, saidOf, initialOf,
} from '../renderer/src/shared-file/shared-file.ts';
import { finishComingBack } from '../renderer/src/shared-file/boot.tsx';
import { cloudClient } from '../renderer/src/cloud-rest.ts';

const rpcOf = (answers) => {
  const asked = [];
  const rpc = async (name, args) => { asked.push([name, args]); const a = answers[name]; if (a instanceof Error) throw a; return typeof a === 'function' ? a(args) : a; };
  return { rpc, asked };
};
const ROW = { name: 'plan.md', kind: 'markdown', type: 'text/markdown', body: '# Plan', version: 2, updated_at: '2026-11-04T10:00:00Z', owner_name: 'Maya Chen', owner_avatar: null, mine: false };
const TOK = 'pR3nY0q7Lw2Xc9Vb5Tz1';

describe('reading the link', () => {
  it('is the file when the link is live, and asks nothing more', async () => {
    const { rpc, asked } = rpcOf({ file_link_view: [ROW] });
    const shown = await readSharedFile(rpc, TOK);
    expect(shown).toEqual({ state: 'file', file: { name: 'plan.md', kind: 'markdown', type: 'text/markdown', body: '# Plan', version: 2, createdAt: Date.parse('2026-11-04T10:00:00Z'), updatedAt: Date.parse('2026-11-04T10:00:00Z'), ownerName: 'Maya Chen', ownerAvatar: null, mine: false } });
    expect(asked).toEqual([['file_link_view', { tok: TOK }]]);
  });
  it('says stopped for a link that was stopped, and does not work for one that never was', async () => {
    expect(await readSharedFile(rpcOf({ file_link_view: [], file_link_stopped: true }).rpc, TOK)).toEqual({ state: 'stopped' });
    expect(await readSharedFile(rpcOf({ file_link_view: [], file_link_stopped: false }).rpc, TOK)).toEqual({ state: 'unknown' });
  });
  it('names a sharer with no name Someone, and takes only an https picture of them', async () => {
    const { file } = await readSharedFile(rpcOf({ file_link_view: [{ ...ROW, owner_name: '  ', owner_avatar: 'javascript:x' }] }).rpc, TOK);
    expect(file.ownerName).toBe('Someone');
    expect(file.ownerAvatar).toBeNull();
  });
  it('lets a lost connection through as a failure, not as a link that does not work', async () => {
    await expect(readSharedFile(rpcOf({ file_link_view: new Error('Failed to fetch') }).rpc, TOK)).rejects.toThrow();
  });
});

describe('comments', () => {
  it('are read with who wrote them, whether they are the owner\'s and whether they are mine', async () => {
    const { rpc } = rpcOf({ file_link_comments_of: [{ id: 'c1', by_name: 'Theo', by_avatar: null, body: 'Hi', created_at: '2026-11-04T10:00:00Z', mine: true, by_owner: false }] });
    expect(await readComments(rpc, 't')).toEqual([{ id: 'c1', byName: 'Theo', byAvatar: null, body: 'Hi', createdAt: Date.parse('2026-11-04T10:00:00Z'), mine: true, byOwner: false }]);
  });
  it('are written and taken back through the database\'s own calls, by their argument names', async () => {
    const { rpc, asked } = rpcOf({ comment_on_file_link: 'new-id', remove_file_link_comment: null });
    expect(await postComment(rpc, 'tok', 'Looks good')).toBe('new-id');
    await removeComment(rpc, 'new-id');
    expect(asked).toEqual([['comment_on_file_link', { tok: 'tok', b: 'Looks good' }], ['remove_file_link_comment', { c: 'new-id' }]]);
  });
});

describe('the words on the page', () => {
  it('say who shared it and on which day, with the time today and the year only when it is not this one', () => {
    const now = Date.parse('2026-11-04T12:00:00Z');
    const today = new Date(Date.parse('2026-11-04T10:05:00Z'));
    expect(sharedLine({ ownerName: 'Maya Chen', updatedAt: today.getTime() }, today.getTime() + 60_000)).toMatch(/^Shared by Maya Chen · today at \d{1,2}:05(am|pm)$/);
    expect(sharedLine({ ownerName: 'Maya Chen', updatedAt: Date.parse('2026-11-02T10:00:00Z') }, now)).toBe('Shared by Maya Chen · Nov 2');
    // A 400-character name ran off the edge of the page (power test, round 3).
    expect(sharedLine({ ownerName: `Z${'z'.repeat(400)}`, updatedAt: 0 })).toBe(`Shared by Z${'z'.repeat(58)}…`);
    expect(sharedLine({ ownerName: 'Maya Chen', updatedAt: Date.parse('2025-06-02T10:00:00Z') }, now)).toBe('Shared by Maya Chen · Jun 2, 2025');
  });
  // After Update link the page still read "Shared by Maya · today at 8:49am", and
  // a reader who had commented could not tell it had changed (power test, round 3).
  it('say the file was updated, and when, once the owner put a newer copy in the link', () => {
    const now = Date.parse('2026-11-04T12:00:00Z');
    expect(sharedLine({ ownerName: 'Maya Chen', createdAt: Date.parse('2026-11-02T10:00:00Z'), updatedAt: Date.parse('2026-11-03T10:00:00Z') }, now)).toBe('Shared by Maya Chen · updated Nov 3');
    expect(sharedLine({ ownerName: 'Maya Chen', createdAt: Date.parse('2026-11-02T10:00:00Z'), updatedAt: Date.parse('2026-11-02T10:00:00Z') }, now)).toBe('Shared by Maya Chen · Nov 2');
  });
  it('read when the link was made off the database row', async () => {
    const { file } = await readSharedFile(rpcOf({ file_link_view: [{ ...ROW, created_at: '2026-11-03T10:00:00Z' }] }).rpc, TOK);
    expect(file.createdAt).toBe(Date.parse('2026-11-03T10:00:00Z'));
  });
  it('give a comment\'s time the way the app does', () => {
    const now = Date.parse('2026-11-04T12:00:00Z');
    expect(commentWhen(now - 20_000, now)).toBe('now');
    expect(commentWhen(now - 5 * 60_000, now)).toBe('5m');
    expect(commentWhen(now - 3 * 3600_000, now)).toBe('3h');
    expect(commentWhen(now - 2 * 86400_000, now)).toBe('2d');
    expect(commentWhen(now - 30 * 86400_000, now)).toBe('Oct 5');
  });
  it('put the database\'s refusal as a sentence, and a lost connection as one plain line', () => {
    expect(saidOf(new Error('too many comments for now; try again in a minute'))).toBe('Too many comments for now. Try again in a minute.');
    expect(saidOf(new Error('sign in to comment'))).toBe('Sign in to comment.');
    expect(saidOf(new TypeError('Failed to fetch'))).toBe('That did not go through. Try again.');
  });
  it('draw a face from the first letter of a name', () => {
    expect(initialOf('maya chen')).toBe('M');
    expect(initialOf('  ')).toBe('?');
  });
});

describe('a picture or a PDF', () => {
  it('is its bytes again from the base64 the link carries', () => {
    expect([...fileBytes({ body: Buffer.from([0, 1, 254, 255]).toString('base64') })]).toEqual([0, 1, 254, 255]);
  });
});

describe('the database client', () => {
  const fake = () => {
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push({ url, init }); return new Response(url.includes('/auth/v1/token') ? JSON.stringify({ access_token: 'mine', refresh_token: 'r', expires_in: 3600, user: { id: 'u1' } }) : '[]', { status: 200 }); };
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    return { calls, client: cloudClient({ url: 'https://db.example', anonKey: 'anon' }, { storage, fetchImpl }) };
  };
  it('asks as nobody, with the public key, when nobody is signed in and the call is for anyone', async () => {
    const { calls, client } = fake();
    expect(await client.rpc('file_link_view', { tok: 't' }, { anyone: true })).toEqual([]);
    expect(calls[0].init.headers.authorization).toBe('Bearer anon');
  });
  it('asks as the person once signed in, so the page knows which comments are theirs', async () => {
    const { calls, client } = fake();
    await client.signInWithPassword('a@b.c', 'pw');
    await client.rpc('file_link_comments_of', { tok: 't' }, { anyone: true });
    expect(calls.at(-1).init.headers.authorization).toBe('Bearer mine');
  });
  // A good link opened as "This file did not load" in a browser holding a
  // sign-in the database no longer took (power test, round 4, 2026-11-04).
  it('asks again as nobody when the sign-in it holds is refused, and lets that sign-in go', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(init.headers.authorization);
      if (url.includes('/auth/v1/token')) return new Response('{"error":"invalid refresh token"}', { status: 400 });
      return init.headers.authorization === 'Bearer anon' ? new Response('[{"name":"plan.md"}]', { status: 200 }) : new Response('{"message":"JWT expired"}', { status: 401 });
    };
    const kept = new Map([['agentbox-cloud-session', JSON.stringify({ access_token: 'old', refresh_token: 'r', expires_at: Date.now() + 3_600_000, user: { id: 'u1', email: 'a@b.c' } })]]);
    const storage = { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v), removeItem: (k) => kept.delete(k) };
    const client = cloudClient({ url: 'https://db.example', anonKey: 'anon' }, { storage, fetchImpl });
    expect(client.signedIn()).toBe(true);
    expect(await client.rpc('file_link_view', { tok: 't' }, { anyone: true })).toEqual([{ name: 'plan.md' }]);
    expect(client.signedIn()).toBe(false);
    expect(calls.at(-1)).toBe('Bearer anon');
  });
  it('lets a lost connection through on a call for anyone, rather than asking again', async () => {
    const fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    await expect(cloudClient({ url: 'https://db.example', anonKey: 'anon' }, { storage, fetchImpl }).rpc('file_link_view', { tok: 't' }, { anyone: true })).rejects.toThrow(/Failed to fetch/);
  });
  it('still refuses a call that is not for anyone without a sign-in', async () => {
    const { calls, client } = fake();
    await expect(client.rpc('comment_on_file_link', { tok: 't', b: 'x' })).rejects.toThrow(/not signed in/);
    expect(calls).toEqual([]);
  });
});

describe('a sign-in coming back to the page', () => {
  const loc = (href) => { const u = new URL(href); return { href, hash: u.hash, pathname: u.pathname, search: u.search }; };
  const client = () => {
    const did = [];
    return { did, finishGoogle: async (code) => { did.push(['google', code]); }, finishEmailLink: async (hash) => { did.push(['email', hash]); } };
  };
  it('finishes Google\'s code and takes it off the address, keeping the rest', async () => {
    const c = client(); const went = [];
    expect(await finishComingBack(c, loc('https://app.example/f/tok123tok123tok1?code=abc&x=1'), (u) => went.push(u))).toBeNull();
    expect(c.did).toEqual([['google', 'abc']]);
    expect(went).toEqual(['/f/tok123tok123tok1?x=1']);
  });
  it('finishes a new account\'s email link and takes it off the address', async () => {
    const c = client(); const went = [];
    await finishComingBack(c, loc('https://app.example/f/tok123tok123tok1#access_token=a&refresh_token=b'), (u) => went.push(u));
    expect(c.did).toEqual([['email', '#access_token=a&refresh_token=b']]);
    expect(went).toEqual(['/f/tok123tok123tok1']);
  });
  it('does nothing on a plain visit, and answers what went wrong when finishing fails', async () => {
    const c = client(); const went = [];
    expect(await finishComingBack(c, loc('https://app.example/f/tok123tok123tok1'), (u) => went.push(u))).toBeNull();
    expect(c.did).toEqual([]);
    expect(went).toEqual([]);
    const failing = { finishGoogle: async () => { throw new Error('This sign-in was started somewhere else. Try again here.'); }, finishEmailLink: async () => {} };
    expect(await finishComingBack(failing, loc('https://app.example/f/x?code=abc'), () => {})).toBe('This sign-in was started somewhere else. Try again here.');
  });
});
