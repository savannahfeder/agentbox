// A SHORT THANK-YOU FROM THE FOUNDER REACHES EACH NEW ACCOUNT ONCE (w-5efd743952).
//
// Asked for: the casual founder email small brands send after a first order
// ("Just a quick note to say thanks ... Hope everything's been treating you
// well"), which gets replies because it reads as typed by a person. Agentbox
// only has an address for people who signed in, so a daily job on the account
// database writes to each of them once, 3 to 7 days after they signed up.
//
// What this pins, since none of it can be watched before it is live:
//   - who gets it: confirmed addresses inside the window, never twice, never
//     the sender or anyone on a team with the sender, at most 50 a day;
//   - what it is: plain text in one of two approved versions, from and
//     reply-to the sender's own address, with "Hey," when there is no real
//     name;
//   - the A/B test asked for on 2026-11-11 ("a/b test option 1 (just my name)
//     against this lowercase"): each account gets one version, chosen from its
//     id so a retry gets the same one, about half each, and the version is
//     recorded with the mark so replies can be counted against it;
//   - that a failed send hands the person back for tomorrow, and a dry run
//     sends nothing;
//   - that no address or name is written into the repository: all of it is in
//     the function's secrets, and a copy without them refuses to send.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  NOTE_WINDOW, NOTES_PER_RUN, VERSIONS, versionFor, firstNameFor, noteFor, keysMatch, readNoteConfig, sendFounderNotes, previewFor,
} from '../cloud/supabase/functions/_shared/founder-note.mjs';
import {
  DEFAULT_ADDRESS, noteUrl, senderLine, newKey, ownersFrom, secretsFile, vaultSql, heldMigration, resultsSql,
} from '../scripts/lib/founder-note-setup.mjs';
import { emptyDatabase } from './an-empty-test-database.mts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const OWNER = 'aaaaaaaa-0000-0000-0000-000000000001';
const config = { from: 'Sam from Agentbox <hello@example.com>', signoff: 'Sam', owners: [OWNER] };

describe('the name it opens with', () => {
  it('uses the first word of a real name', () => {
    expect(firstNameFor('Ada Lovelace', 'ada@x.dev')).toBe('Ada');
    expect(firstNameFor('  Grace  ', 'g@x.dev')).toBe('Grace');
  });

  it('says "there" when the name looks like a username, or is missing', () => {
    expect(firstNameFor('ada.lovelace92', 'ada.lovelace92@x.dev')).toBe(null);
    expect(firstNameFor('ADA_LOVELACE', 'x@x.dev')).toBe(null);
    expect(firstNameFor('ada92 Lovelace', 'x@x.dev')).toBe(null);
    expect(firstNameFor('', 'a@x.dev')).toBe(null);
    expect(firstNameFor(null, 'a@x.dev')).toBe(null);
    expect(firstNameFor('someone@x.dev', 'someone@x.dev')).toBe(null);
    expect(firstNameFor('1234', 'q@x.dev')).toBe(null);
  });

  it('keeps a real name even when the address starts with it', () => {
    expect(firstNameFor('Ada', 'ada@x.dev')).toBe('Ada');
    expect(firstNameFor('José Núñez', 'jose@x.dev')).toBe('José');
    expect(firstNameFor('Mary-Jane O\'Neil', 'mj@x.dev')).toBe('Mary-Jane');
  });

  // Of 149 confirmed accounts on 2026-11-10, 9 typed their first name all in
  // lowercase and 3 gave a single letter.
  it('capitalises a name typed all in lowercase or all in capitals', () => {
    expect(firstNameFor('ada lovelace')).toBe('Ada');
    expect(firstNameFor('ADA')).toBe('Ada');
    expect(firstNameFor('josé')).toBe('José');
    expect(firstNameFor('mary-jane')).toBe('Mary-jane');
  });

  it('leaves a name with its own mix of capitals as it was typed', () => {
    expect(firstNameFor('DeShawn')).toBe('DeShawn');
    expect(firstNameFor('McKenzie Smith')).toBe('McKenzie');
  });

  it('treats a single letter as no name, and keeps two letters', () => {
    expect(firstNameFor('J')).toBe(null);
    expect(firstNameFor('j smith')).toBe(null);
    expect(firstNameFor('Al')).toBe('Al');
    expect(firstNameFor('jo')).toBe('Jo');
  });
});

describe('the email itself', () => {
  it('"name" is option 1 as approved, in plain text, from and reply-to the sender', () => {
    const note = noteFor({ name: 'Ada Lovelace', email: 'ada@x.dev' }, config, 'name');
    expect(note).toEqual({
      from: config.from,
      to: ['ada@x.dev'],
      reply_to: 'hello@example.com',
      subject: 'Thanks for trying Agentbox',
      text: "Hey Ada,\n\nJust a quick note to say thanks for trying Agentbox.\n\nHope it's been treating you well.\n\nSam\n",
    });
    expect(note).not.toHaveProperty('html');
  });

  it('"lowercase" is the version as written on the thread, the name lowercased too', () => {
    const note = noteFor({ name: 'Ada Lovelace', email: 'ada@x.dev' }, config, 'lowercase');
    expect(note).toEqual({
      from: config.from,
      to: ['ada@x.dev'],
      reply_to: 'hello@example.com',
      subject: 'thanks for trying agentbox',
      text: "hey ada,\n\njust a quick note to say thanks for trying agentbox. hope it's been treating you well!\n\nsam\n",
    });
  });

  it('says just "Hey," or "hey," without a real name', () => {
    expect(noteFor({ name: 'ada92', email: 'ada92@x.dev' }, config, 'name').text.startsWith('Hey,\n\nJust')).toBe(true);
    expect(noteFor({ name: '', email: 'a@x.dev' }, config, 'lowercase').text.startsWith('hey,\n\njust')).toBe(true);
  });

  it('refuses a version it does not know', () => {
    expect(() => noteFor({ name: 'Ada', email: 'a@x.dev' }, config, 'shouty')).toThrow();
  });

  it('takes a bare address as the sender too', () => {
    expect(noteFor({ name: 'Ada', email: 'a@x.dev' }, { ...config, from: 'hello@example.com' }, 'name').reply_to).toBe('hello@example.com');
  });
});

describe('which version each person gets', () => {
  const ids = Array.from({ length: 1000 }, (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-${String(i * 7919).padStart(12, '0').slice(-12)}`);

  it('is one of the two, and the same every time for the same account', () => {
    expect(VERSIONS).toEqual(['name', 'lowercase']);
    for (const id of ids.slice(0, 50)) {
      expect(VERSIONS).toContain(versionFor(id));
      expect(versionFor(id)).toBe(versionFor(id));
      expect(versionFor(id.toUpperCase())).toBe(versionFor(id));
    }
  });

  it('splits accounts about half and half', () => {
    const lower = ids.filter((id) => versionFor(id) === 'lowercase').length;
    expect(lower).toBeGreaterThan(450);
    expect(lower).toBeLessThan(550);
  });
});

describe('the key the daily job knocks with', () => {
  it('matches only the exact key', () => {
    expect(keysMatch('k'.repeat(40), 'k'.repeat(40))).toBe(true);
    expect(keysMatch('k'.repeat(40), `${'k'.repeat(39)}j`)).toBe(false);
    expect(keysMatch('k'.repeat(40), 'k'.repeat(39))).toBe(false);
    expect(keysMatch('', '')).toBe(false);
    expect(keysMatch(undefined, undefined)).toBe(false);
  });
});

describe('the settings it needs', () => {
  const env = { FOUNDER_NOTE_FROM: config.from, FOUNDER_NOTE_NAME: 'Sam', FOUNDER_NOTE_OWNERS: ` ${OWNER}, BBBBBBBB-0000-0000-0000-000000000002 `, FOUNDER_NOTE_KEY: 'k'.repeat(40), RESEND_API_KEY: 're_x' };
  const get = (vars) => (name) => vars[name];

  it('reads every one from the function secrets', () => {
    expect(readNoteConfig(get(env))).toEqual({
      from: config.from, signoff: 'Sam', owners: [OWNER, 'bbbbbbbb-0000-0000-0000-000000000002'], key: 'k'.repeat(40), resendKey: 're_x',
    });
  });

  it('is off until each is set', () => {
    for (const name of Object.keys(env)) expect(readNoteConfig(get({ ...env, [name]: '' }))).toBe(null);
  });
});

// A stand-in for the database and for Resend, holding what each was asked.
function world({ due = [], claimed = [], refuse = [] } = {}) {
  const notes = new Set(claimed);
  const versions = {};
  const sent = [];
  const asked = [];
  return {
    notes, sent, asked, versions,
    db: {
      due: async (args) => { asked.push(args); return due.filter((p) => !notes.has(p.id)); },
      claim: async (id, version) => { if (notes.has(id)) return false; notes.add(id); versions[id] = version; return true; },
      release: async (id) => { notes.delete(id); },
    },
    send: async (note, id) => {
      if (refuse.includes(id)) return { ok: false, error: 'mail refused' };
      sent.push({ id, to: note.to[0], lowercase: note.subject === note.subject.toLowerCase() });
      return { ok: true };
    },
  };
}
const ada = { id: 'p1', email: 'ada@x.dev', name: 'Ada' };
const bob = { id: 'p2', email: 'bob@x.dev', name: 'Bob' };

describe('a day of notes', () => {
  it('asks for people 3 to 7 days old, leaving out the sender, at most 50', async () => {
    const w = world();
    await sendFounderNotes({ ...w, config });
    expect(w.asked).toEqual([{ owners: [OWNER], oldestDays: 7, youngestDays: 3, limit: 50 }]);
    expect(NOTE_WINDOW).toEqual({ oldestDays: 7, youngestDays: 3 });
    expect(NOTES_PER_RUN).toBe(50);
  });

  it('sends each person due one note and marks it', async () => {
    const w = world({ due: [ada, bob] });
    expect(await sendFounderNotes({ ...w, config })).toEqual({ sent: 2, failed: 0, due: 2 });
    expect(w.sent.map(({ id, to }) => ({ id, to }))).toEqual([{ id: 'p1', to: 'ada@x.dev' }, { id: 'p2', to: 'bob@x.dev' }]);
    expect([...w.notes]).toEqual(['p1', 'p2']);
  });

  it('sends each person their own version and records it with the mark', async () => {
    const people = Array.from({ length: 40 }, (_, i) => ({ id: `0000000${i % 10}-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`, email: `p${i}@x.dev`, name: 'Pat' }));
    const w = world({ due: people });
    await sendFounderNotes({ ...w, config });
    for (const s of w.sent) {
      expect(w.versions[s.id]).toBe(versionFor(s.id));
      expect(s.lowercase).toBe(versionFor(s.id) === 'lowercase');
    }
    expect(new Set(Object.values(w.versions))).toEqual(new Set(VERSIONS));
  });

  it('never sends twice: a second run the same day finds nobody', async () => {
    const w = world({ due: [ada] });
    await sendFounderNotes({ ...w, config });
    expect(await sendFounderNotes({ ...w, config })).toEqual({ sent: 0, failed: 0, due: 0 });
    expect(w.sent).toHaveLength(1);
  });

  it('skips someone another run claimed between the list and the send', async () => {
    const w = world({ due: [ada, bob] });
    const due = w.db.due;
    w.db.due = async (a) => { const list = await due(a); w.notes.add('p1'); return list; };
    expect(await sendFounderNotes({ ...w, config })).toEqual({ sent: 1, failed: 0, due: 2 });
    expect(w.sent.map((s) => s.id)).toEqual(['p2']);
  });

  it('hands back someone whose send failed, so tomorrow tries again', async () => {
    const w = world({ due: [ada, bob], refuse: ['p1'] });
    const out = await sendFounderNotes({ ...w, config });
    expect(out).toEqual({ sent: 1, failed: 1, due: 2, error: 'mail refused' });
    expect(w.notes.has('p1')).toBe(false);
    expect(w.notes.has('p2')).toBe(true);
  });

  it('sends nothing and marks nothing on a dry run', async () => {
    const w = world({ due: [ada, bob] });
    const out = await sendFounderNotes({ ...w, config, dryRun: true });
    expect(out).toMatchObject({ sent: 0, failed: 0, due: 2, dryRun: true, names: ['Ada', 'Bob'] });
    expect(out.versions.name + out.versions.lowercase).toBe(2);
    expect(w.sent).toEqual([]);
    expect(w.notes.size).toBe(0);
  });
});

// Every migration on a real Postgres, as the other cloud tests run them.
describe('who the database says is due', () => {
  const migrations = fs.readdirSync(path.join(root, 'cloud/supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => read(`cloud/supabase/migrations/${f}`)).join('\n');
  const STAND_IN = `
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated; create role anon; create role service_role;
create publication supabase_realtime;
`;
  let db;
  const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  async function signUp(n, email, { daysAgo, name = `Person ${n}`, confirmed = true }) {
    await db.query('insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3, $4)',
      [id(n), email, confirmed ? new Date() : null, name === null ? {} : { full_name: name }]);
    await db.query(`update public.people set created_at = now() - make_interval(days => $2::int) - interval '1 hour' where id = $1`, [id(n), daysAgo]);
  }
  const due = async () => (await db.query(`select * from public.founder_note_due($1::uuid[], 7, 3, 50)`, [[id(1)]])).rows;

  beforeAll(async () => {
    db = new PGlite(await emptyDatabase());
    await db.exec(STAND_IN);
    await db.exec(migrations);
    await signUp(1, 'owner@example.com', { daysAgo: 5 });
    await signUp(2, 'two@x.dev', { daysAgo: 2 });
    await signUp(3, 'three@x.dev', { daysAgo: 3, name: 'Ada Lovelace' });
    await signUp(4, 'six@x.dev', { daysAgo: 6, name: null });
    await signUp(5, 'seven@x.dev', { daysAgo: 7 });
    await signUp(6, 'unconfirmed@x.dev', { daysAgo: 4, confirmed: false });
    await signUp(7, 'teammate@x.dev', { daysAgo: 4 });
    await signUp(8, 'stranger-team@x.dev', { daysAgo: 4 });
    await signUp(9, 'noted@x.dev', { daysAgo: 4 });
    const [{ id: team }] = (await db.query(`insert into public.teams (name, created_by) values ('T', $1) returning id`, [id(1)])).rows;
    await db.query('insert into public.team_members (team_id, person_id) values ($1, $2), ($1, $3)', [team, id(1), id(7)]);
    const [{ id: other }] = (await db.query(`insert into public.teams (name, created_by) values ('U', $1) returning id`, [id(8)])).rows;
    await db.query('insert into public.team_members (team_id, person_id) values ($1, $2)', [other, id(8)]);
    await db.query('insert into public.founder_notes (person_id) values ($1)', [id(9)]);
  });
  afterAll(() => db?.close());

  it('is everyone confirmed between 3 and 7 days old, oldest first, with the name they gave', async () => {
    expect(await due()).toEqual([
      { id: id(4), email: 'six@x.dev', name: '' },
      { id: id(8), email: 'stranger-team@x.dev', name: 'Person 8' },
      { id: id(3), email: 'three@x.dev', name: 'Ada Lovelace' },
    ]);
  });

  it('stops at the number asked for, and never past 50', async () => {
    expect((await db.query(`select * from public.founder_note_due($1::uuid[], 7, 3, 1)`, [[id(1)]])).rows.map((r) => r.email)).toEqual(['six@x.dev']);
    expect(read('cloud/supabase/migrations/20261110000000_a_thank_you_note_from_the_founder.sql')).toMatch(/limit least\(how_many, 50\)/);
  });

  it('drops someone once they are marked, and lets them go when their account is deleted', async () => {
    await db.query('insert into public.founder_notes (person_id) values ($1)', [id(3)]);
    expect((await due()).map((r) => r.email)).toEqual(['six@x.dev', 'stranger-team@x.dev']);
    await db.query('delete from auth.users where id = $1', [id(3)]);
    expect((await db.query('select count(*)::int as n from public.founder_notes where person_id = $1', [id(3)])).rows[0].n).toBe(0);
  });

  it('records which version each person got, and only one of the two', async () => {
    await db.query(`insert into public.founder_notes (person_id, version) values ($1, 'lowercase')`, [id(4)]);
    expect((await db.query('select version from public.founder_notes where person_id = $1', [id(4)])).rows).toEqual([{ version: 'lowercase' }]);
    await expect(db.query(`insert into public.founder_notes (person_id, version) values ($1, 'shouty')`, [id(8)])).rejects.toThrow();
    await db.query('delete from public.founder_notes where person_id = $1', [id(4)]);
  });

  it('counts who got each version and, of those who replied, which version they had', async () => {
    await db.query(`insert into public.founder_notes (person_id, version) values ($1, 'name'), ($2, 'lowercase'), ($3, 'lowercase')`, [id(2), id(4), id(5)]);
    const rows = async (replied) => (await db.query(resultsSql(replied))).rows;
    expect(await rows([])).toEqual([
      { version: 'lowercase', sent: 2, replied: 0 },
      { version: 'name', sent: 1, replied: 0 },
      { version: null, sent: 1, replied: 0 },
    ]);
    expect(await rows(['SIX@x.dev', 'seven@x.dev ', "o'brien@x.dev", 'not an address', "x'); drop table public.people; --"])).toEqual([
      { version: 'lowercase', sent: 2, replied: 2 },
      { version: 'name', sent: 1, replied: 0 },
      { version: null, sent: 1, replied: 0 },
    ]);
    expect((await db.query('select count(*)::int as n from public.people')).rows[0].n).toBeGreaterThan(0);
    await db.query('delete from public.founder_notes where person_id in ($1, $2, $3)', [id(2), id(4), id(5)]);
  });

  it('is closed to signed-in people and strangers', async () => {
    for (const role of ['authenticated', 'anon']) {
      await db.exec(`set role ${role}`);
      await expect(db.query(`select * from public.founder_note_due($1::uuid[], 7, 3, 50)`, [[id(1)]])).rejects.toThrow(/permission denied/);
      await expect(db.query('select * from public.founder_notes')).rejects.toThrow(/permission denied/);
      await db.exec('reset role');
    }
  });

  it('can be applied again, keeping who was already written to', async () => {
    await db.exec(read('cloud/supabase/migrations/20261110000000_a_thank_you_note_from_the_founder.sql'));
    expect((await due()).map((r) => r.email)).toEqual(['six@x.dev', 'stranger-team@x.dev']);
  });
});

describe('what is written down', () => {
  const fn = read('cloud/supabase/functions/founder-note/index.ts');
  const shared = read('cloud/supabase/functions/_shared/founder-note.mjs');
  const sql = read('cloud/supabase/migrations/20261110000000_a_thank_you_note_from_the_founder.sql');

  it('names no real address in the function or its rules', () => {
    expect(fn).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(shared.replace(/hello@example\.com/g, '')).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    expect(fn).toMatch(/Deno\.env\.get/);
  });

  it('takes no sign-in token, only its own key', () => {
    expect(read('cloud/supabase/config.toml')).toMatch(/\[functions\.founder-note\]\s*\nverify_jwt = false/);
    expect(fn).toMatch(/keysMatch/);
  });

  it('keeps the list of who was written to out of reach of every signed-in person', () => {
    expect(sql).toMatch(/alter table public\.founder_notes enable row level security/);
    expect(sql).toMatch(/revoke all on function public\.founder_note_due\([^)]*\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.founder_note_due\([^)]*\) to service_role/);
    expect(sql).toMatch(/security definer\s+set search_path = ''/);
  });

  it('only writes to confirmed addresses, and skips the sender and their teammates', () => {
    expect(sql).toMatch(/email_confirmed_at is not null/);
    // The name typed at sign-up, not people.name, which falls back to the
    // start of the address.
    expect(sql).toMatch(/raw_user_meta_data->>'full_name'/);
    expect(sql).toMatch(/team_members/);
    expect(sql).toMatch(/owners/);
  });

  it('can be applied twice without harm', () => {
    expect(sql).toMatch(/create table if not exists public\.founder_notes/);
    expect(sql).toMatch(/create or replace function public\.founder_note_due/);
    expect(sql).toMatch(/cron\.schedule\(\s*'founder-note'/);
  });
});

describe('a preview', () => {
  it("goes to an owner's account, greeting them by the name it is signed with", () => {
    expect(previewFor({ id: OWNER, email: 'sam@x.dev' }, config, 'name')).toMatchObject({ to: ['sam@x.dev'], subject: 'Thanks for trying Agentbox' });
    expect(previewFor({ id: OWNER.toUpperCase(), email: 'sam@x.dev' }, config, 'name').text.startsWith('Hey Sam,\n')).toBe(true);
    expect(previewFor({ id: OWNER, email: 'sam@x.dev' }, config, 'lowercase').text.startsWith('hey sam,\n')).toBe(true);
  });

  it('never goes to anyone else', () => {
    expect(previewFor({ id: 'bbbbbbbb-0000-0000-0000-000000000002', email: 'stranger@x.dev' }, config)).toBe(null);
    expect(previewFor({ id: OWNER }, config)).toBe(null);
    expect(previewFor(undefined, config)).toBe(null);
  });
});

describe('setting it up', () => {
  it('sends from hello@agentbox.ac unless told otherwise', () => {
    expect(DEFAULT_ADDRESS).toBe('hello@agentbox.ac');
    expect(senderLine(' Sam ', 'hello@agentbox.ac')).toBe('Sam from Agentbox <hello@agentbox.ac>');
    expect(noteUrl('abcdefghijklmnopqrst')).toBe('https://abcdefghijklmnopqrst.supabase.co/functions/v1/founder-note');
  });

  it('reads owners as a lowercase list', () => {
    expect(ownersFrom(' A@x.dev, b@y.dev ,,')).toEqual(['a@x.dev', 'b@y.dev']);
    expect(ownersFrom(undefined)).toEqual([]);
  });

  it('makes a new 64-character key each time', () => {
    const a = newKey();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(newKey()).not.toBe(a);
  });

  it('writes the secrets so a quote in the name cannot break the file', () => {
    expect(secretsFile({ from: 'Sam "S" from Agentbox <hello@agentbox.ac>', name: 'Sam', owners: ['a@x.dev', 'b@y.dev'], key: 'k' }))
      .toBe('FOUNDER_NOTE_FROM="Sam \\"S\\" from Agentbox <hello@agentbox.ac>"\nFOUNDER_NOTE_NAME="Sam"\nFOUNDER_NOTE_OWNERS="a@x.dev,b@y.dev"\nFOUNDER_NOTE_KEY="k"\n');
  });

  it('refuses to put anything but the exact address and key into SQL', () => {
    const url = noteUrl('abcdefghijklmnopqrst');
    expect(() => vaultSql({ url: `${url}'; drop table x; --`, key: newKey() })).toThrow();
    expect(() => vaultSql({ url, key: "a'b" })).toThrow();
    expect(() => vaultSql({ url: 'https://evil.example/functions/v1/founder-note', key: newKey() })).toThrow();
  });

  it('puts the address and key in the vault, and replaces them on a second run', async () => {
    const db = new PGlite(await emptyDatabase());
    try {
      await db.exec(`
        create schema vault;
        create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text);
        create function vault.create_secret(s text, n text) returns uuid language sql as $$ insert into vault.secrets (name, secret) values (n, s) returning id $$;
        create function vault.update_secret(i uuid, s text) returns void language sql as $$ update vault.secrets set secret = s where id = i $$;
      `);
      const url = noteUrl('abcdefghijklmnopqrst');
      const first = newKey();
      const second = newKey();
      await db.exec(vaultSql({ url, key: first }));
      await db.exec(vaultSql({ url, key: second }));
      expect((await db.query('select name, secret from vault.secrets order by name')).rows).toEqual([
        { name: 'founder_note_key', secret: second },
        { name: 'founder_note_url', secret: url },
      ]);
    } finally {
      await db.close();
    }
  });

  it('can hold the daily job: the table and query go in, a running job stops, nothing new is scheduled', async () => {
    const db = new PGlite(await emptyDatabase());
    try {
      await db.exec(STAND_IN_FOR_HOLD);
      await db.exec(`
        create schema cron;
        create table cron.job (jobid serial primary key, jobname text);
        create function cron.unschedule(id int) returns boolean language sql as $$ delete from cron.job where jobid = id returning true $$;
        insert into cron.job (jobname) values ('founder-note'), ('something-else');
      `);
      const held = heldMigration(read('cloud/supabase/migrations/20261110000000_a_thank_you_note_from_the_founder.sql'));
      expect(held).not.toMatch(/cron\.schedule/);
      await db.exec(held);
      await db.exec(held);
      expect((await db.query('select jobname from cron.job')).rows).toEqual([{ jobname: 'something-else' }]);
      expect((await db.query(`select count(*)::int as n from public.founder_note_due($1::uuid[], 7, 3, 50)`, [[]])).rows[0].n).toBe(0);
    } finally {
      await db.close();
    }
  });

  it('holds safely where there is no scheduler at all', async () => {
    const db = new PGlite(await emptyDatabase());
    try {
      await db.exec(STAND_IN_FOR_HOLD);
      await expect(db.exec(heldMigration(read('cloud/supabase/migrations/20261110000000_a_thank_you_note_from_the_founder.sql')))).resolves.toBeDefined();
      expect(() => heldMigration('select 1;')).toThrow();
    } finally {
      await db.close();
    }
  });
});

// Just enough of the account database for the note's own migration.
const STAND_IN_FOR_HOLD = `
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
create role authenticated; create role anon; create role service_role;
create table public.people (id uuid primary key references auth.users(id) on delete cascade, email text not null, name text not null default '', created_at timestamptz not null default now());
create table public.team_members (team_id uuid not null, person_id uuid not null, primary key (team_id, person_id));
`;

// The first deploy of this function stopped on "open templates/confirm.html:
// no such file or directory": the CLI reads content_path from the folder above
// supabase/, so a path written from inside it breaks every deploy.
describe('the function can be deployed from this repository', () => {
  it('names every email template where the Supabase CLI looks for it', () => {
    const paths = [...read('cloud/supabase/config.toml').matchAll(/^content_path = "([^"]+)"/gm)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(fs.existsSync(path.join(root, 'cloud', p)), p).toBe(true);
  });
});
