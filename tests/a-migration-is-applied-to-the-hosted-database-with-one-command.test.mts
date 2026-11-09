// A MIGRATION IS APPLIED TO THE HOSTED DATABASE WITH ONE COMMAND.
//
// Until 2026-10-24 each new migration reached the hosted database through a
// curl line pasted into the thread for the founder to run (phone settings,
// delete account, alert addresses), because nothing in the repository did it.
// scripts/apply-migration.mjs does: the project from the team cloud's address,
// the key from the Supabase CLI's own keychain entry, each file in order, a
// deadline on every call, and nothing that names the person who runs it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { projectRef, cliToken, applyMigration } from '../scripts/apply-migration.mjs';

describe('the project and the key', () => {
  it('the project is the ref in the database\'s own address, and nothing else is', () => {
    expect(projectRef('https://abcdefghijklmnopqrst.supabase.co')).toBe('abcdefghijklmnopqrst');
    for (const not of ['https://example.com', 'http://abcdefghijklmnopqrst.supabase.co', null, 'https://short.supabase.co']) expect(projectRef(not)).toBeNull();
  });
  it('the key is read as the CLI keeps it, encoded or not', () => {
    expect(cliToken(`go-keyring-base64:${Buffer.from('sbp_abc').toString('base64')}\n`)).toBe('sbp_abc');
    expect(cliToken('sbp_plain\n')).toBe('sbp_plain');
  });
});

describe('applying one file', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mig-')), '1_x.sql');
  fs.writeFileSync(file, 'select 1;');

  it('sends the file\'s SQL to that project with a deadline and a plain user agent', async () => {
    const asked = [];
    await applyMigration(file, { ref: 'r', token: 't', fetchImpl: async (url, init) => { asked.push({ url, init }); return new Response('[]', { status: 201 }); } });
    expect(asked[0].url).toBe('https://api.supabase.com/v1/projects/r/database/query');
    expect(JSON.parse(asked[0].init.body)).toEqual({ query: 'select 1;' });
    expect(asked[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(asked[0].init.headers['user-agent']).toBe('Mozilla/5.0');
  });

  it('stops, with the database\'s words, when it refuses', async () => {
    await expect(applyMigration(file, { ref: 'r', token: 't', fetchImpl: async () => new Response('{"message":"syntax error"}', { status: 400 }) }))
      .rejects.toThrow(/1_x\.sql: the database said 400: .*syntax error/);
  });
});
