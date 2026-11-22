// A RELEASE STOPS WHEN THE LIVE DATABASE IS MISSING A CHANGE.
//
// 2026-11-12: the shared page and the Share panel shipped calling
// set_file_link_access, file_link_door and eight more, and every one answered
// 404 on the live cloud, so every link stayed open to anyone. Fourteen merged
// migrations (Oct 29 to Nov 12) had never been applied there, because nothing
// applies them and nothing checked. Measured against the live database: 14
// files whose tables, columns or functions were absent. scripts/deploy.mjs now
// asks scripts/migrations-on-live.mjs before it builds anything.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { whatTheMigrationsMake, missingOnLive } from '../scripts/lib/migrations-on-live.mjs';
import { leftFromARelease, nextVersion, serverConfig, whatIsLive, withVersion } from '../scripts/lib/deploy-rules.mjs';

const made = (...files: [string, string][]) => [...whatTheMigrationsMake(files.map(([name, sql]) => ({ name, sql }))).keys()].sort();

describe('what the migrations make', () => {
  it('reads functions, tables, columns, rules and triggers', () => {
    expect(made(['1.sql', `
      create table if not exists public.notes (id uuid);
      alter table public.notes add column if not exists body text, add column at timestamptz;
      create or replace function public.keep_note(b text) returns void language sql as $$ select 1 $$;
      drop policy if exists notes_read on public.notes;
      create policy notes_read on public.notes for select using (true);
      create policy "Phone files read" on storage.objects for select using (true);
      create trigger notes_stamped before insert on public.notes for each row execute function public.keep_note();
    `])).toEqual([
      'c:notes.at', 'c:notes.body', 'f:keep_note', 'g:notes_stamped',
      'p:public.notes.notes_read', 'p:storage.objects.Phone files read', 't:notes',
    ]);
  });

  it('does not expect what a later file drops', () => {
    expect(made(
      ['1.sql', 'create table public.a (x int); create function public.f() returns int as $$ select 1 $$ language sql; alter table public.b add column y int;'],
      ['2.sql', 'drop function if exists public.f(); drop table if exists public.a; alter table public.b drop column if exists y;'],
    )).toEqual([]);
  });

  it('expects what is dropped and made again, under the file that made it last', () => {
    const objects = whatTheMigrationsMake([
      { name: '1.sql', sql: 'create function public.f() returns int as $$ select 1 $$ language sql;' },
      { name: '2.sql', sql: 'drop function if exists public.f(); create function public.f() returns int as $$ select 2 $$ language sql;' },
    ]);
    expect(objects.get('f:f')).toBe('2.sql');
  });

  it('ignores words in comments and objects outside public', () => {
    expect(made(['1.sql', '-- create table public.ghost (x int);\ncreate table other.t (x int);\nselect 1;'])).toEqual([]);
  });
});

describe('what the live database is missing', () => {
  const files = [
    { name: '20261111_old.sql', sql: 'create table public.a (x int);' },
    { name: '20261112_links.sql', sql: 'create or replace function public.file_link_door(tok text) returns text as $$ select 1 $$ language sql;' },
  ];

  it('names each file with something missing, in order, with what is missing', () => {
    expect(missingOnLive(files, ['t:a'])).toEqual([{ file: '20261112_links.sql', missing: ['f:file_link_door'] }]);
  });

  it('names none when everything is there', () => {
    expect(missingOnLive(files, ['t:a', 'f:file_link_door', 'f:other'])).toEqual([]);
  });

  it('every migration in the repository makes something it can check', () => {
    const dir = new URL('../cloud/supabase/migrations/', import.meta.url);
    const all = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).map((name) => ({ name, sql: fs.readFileSync(new URL(name, dir), 'utf8') }));
    const objects = whatTheMigrationsMake(all);
    expect(objects.get('f:set_file_link_access')).toMatch(/a_link_says_who_can_open_it/);
    expect(objects.get('t:file_versions')).toMatch(/one_version_line_per_file/);
  });
});

// The real deploy script, with fake commands, as the other deploy tests run it.
const scriptUrl = new URL('../scripts/deploy.mjs', import.meta.url);
const source = fs.readFileSync(scriptUrl, 'utf8').replace(/^import .+;\n/gm, '').replaceAll('import.meta.url', JSON.stringify(scriptUrl.href));
const repo = path.join(path.dirname(fileURLToPath(scriptUrl)), '..');

function deploy({ check, argv = [] as string[] }: { check: { status: number; stdout: string }; argv?: string[] }) {
  const ran: string[][] = [];
  const said: string[] = [];
  let exitCode: number | null = null;
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  const context = {
    path, os, fileURLToPath, leftFromARelease, nextVersion, serverConfig, whatIsLive, withVersion,
    RELEASE_REPO: 'example/releases',
    fs: {
      existsSync: () => true,
      readFileSync: () => JSON.stringify({ name: 'agentbox-app', version: '1.0.0', posthogKey: 'phc_key', bucket: 'b', runtimeArn: 'r' }),
      writeFileSync: () => {}, mkdtempSync: (p: string) => `${p}x`, symlinkSync: () => {},
    },
    console: { log: (...a: unknown[]) => said.push(a.join(' ')), error: (...a: unknown[]) => said.push(a.join(' ')) },
    process: { argv: ['node', 'deploy.mjs', ...argv], env: {}, on: () => {}, exit: (code: number) => { throw new Error(`exit:${code}`); } },
    execFileSync: () => JSON.stringify({ version: '1.0.0' }),
    spawnSync(command: string, args: string[]) {
      ran.push([command, ...args]);
      if (command === 'node' && args.includes('scripts/migrations-on-live.mjs')) return { ...check, stderr: '' };
      if (command === 'git' && args[0] === 'rev-parse') return ok('a'.repeat(40));
      if (command === 'npm' && args[0] === 'view') return ok(args[2] === 'versions' ? '[]' : '1.0.0');
      if (command === 'security') return ok('"Developer ID Application: Test (ABCDEFGHIJ)"');
      if (command === 'gh' && args[0] === 'api') return ok('true');
      if (command === 'gh' && args[0] === 'release') return ok('v1.0.0');
      if (command === 'curl') return ok('version: 1.0.0');
      if (command === 'aws' && args[0] === 'lambda') return ok(new Date(Date.now() + 60_000).toISOString());
      return ok();
    },
  };
  try { vm.runInNewContext(source, context, { timeout: 1_000 }); } catch (error) {
    if (!/^exit:\d+$/.test((error as Error).message)) throw error;
    exitCode = Number((error as Error).message.slice(5));
  }
  const built = ran.some(([c, a]) => c === 'node' && a === 'scripts/release.mjs');
  return { built, exitCode, said: said.join('\n') };
}

describe('the release asks the live database first', () => {
  const missing = { status: 1, stdout: '20261112120000_a_link_says_who_can_open_it_and_what_they_can_do.sql' };

  it('stops before building, and names the file and how to apply it', () => {
    const run = deploy({ check: missing });
    expect(run.built).toBe(false);
    expect(run.exitCode).toBe(1);
    expect(run.said).toContain('20261112120000_a_link_says_who_can_open_it_and_what_they_can_do.sql');
    expect(run.said).toContain('scripts/apply-migration.mjs cloud/supabase/migrations/20261112120000_a_link_says_who_can_open_it_and_what_they_can_do.sql');
  });

  it('stops when it cannot read the live database, rather than guessing', () => {
    const run = deploy({ check: { status: 2, stdout: 'the database said 401' } });
    expect(run.built).toBe(false);
    expect(run.exitCode).toBe(1);
    expect(run.said).toContain('the database said 401');
  });

  it('goes on to build when nothing is missing', () => {
    expect(deploy({ check: { status: 0, stdout: '' } }).built).toBe(true);
  });

  it('a check run says what is missing and changes nothing', () => {
    const run = deploy({ check: missing, argv: ['--check'] });
    expect(run.built).toBe(false);
    expect(run.exitCode).toBe(0);
    expect(run.said).toContain('20261112120000_a_link_says_who_can_open_it_and_what_they_can_do.sql');
  });
});
