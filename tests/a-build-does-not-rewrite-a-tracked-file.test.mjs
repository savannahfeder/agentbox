// A BUILD DOES NOT REWRITE A TRACKED FILE.
//
// MEASURED 2026-10-07 (w-5952e6de3e, then w-6bbb709b1f). `npm run build` ran
// scripts/read-claude-commands.mjs and scripts/read-claude-models.mjs, and both
// wrote over TRACKED files: shared/claude-commands.generated.mjs and
// shared/claude-models.generated.mjs. So every folder that had ever run the app
// reported itself dirty. `releaseTaskFolder` answered "uncommitted" and never
// reclaimed a folder, `parkTaskFolder` committed nobody's work, `cloneCheckout`
// refused the block-sharing clone, and the diff in a change card carried two
// files nobody had touched.
//
// WHAT THE DIRT ACTUALLY WAS, measured in this checkout the same day by running
// the two generators to a temp file and diffing:
//
//   commands: READ_FROM "2.1.292" -> "2.1.293", READ_AT "2026-10-07" -> "2026-10-08".
//             NOTHING ELSE. The command table was identical across seven
//             releases of Claude Code.
//   models:   the same two stamps, AND real data: haiku moved from Haiku 4.5 to
//             Haiku 5.5, and picked up a default level.
//
// So one of the two files churns on the clock and the other churns on real
// runtime data, and neither is anybody's edit.
//
// WHY NOT FILTER THE NAME EVERYWHERE instead: reviewed and rejected on
// w-6bbb709b1f. A filename pattern cannot tell a regenerated timestamp from a
// real change to the commands, aliases or model ids, and main/task-folders.mjs
// runs against arbitrary product repositories where this app's naming
// convention means nothing.
//
// SO THE BUILD WRITES WHAT IT READ ON THIS MACHINE INTO AN IGNORED FILE, the
// committed table stays the fallback it already was, and adopting a new reading
// is a deliberate `npm run read:claude` rather than a side effect of a build.
// What is NOT given up: the build still reads the installed binary every time
// and still stops, loudly, when a command the menu offers has gone.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as commands from '../scripts/read-claude-commands.mjs';
import * as models from '../scripts/read-claude-models.mjs';
import { claudeModels, forget } from '../main/claude-models.mjs';
import { CLAUDE_MODELS } from '../shared/claude-models.generated.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CATALOG = fs.readFileSync(path.join(HERE, 'fixtures', 'claude-catalog-2.1.280.txt'), 'utf8');

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-generated-'));
  return { dir, out: path.join(dir, 'table.generated.mjs'), local: path.join(dir, 'table.local.json') };
}

/** A file shaped like the bundle, with a record for every command WANTED. */
function bundleWith({ drop = [] } = {}) {
  const text = commands.WANTED.filter((n) => !drop.includes(n))
    .map((n) => `{type:"local",name:"${n}",supportsNonInteractive:!0,description:"Does ${n}"}`)
    .join(',');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-bundle-'));
  const at = path.join(dir, 'claude');
  fs.writeFileSync(at, `prelude ${text} postlude`);
  return at;
}

/** The catalog fixture, as a file the models reader can walk. */
function catalogBin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-catalog-'));
  const at = path.join(dir, 'claude');
  fs.writeFileSync(at, CATALOG);
  return at;
}

const said = () => { const lines = []; return { lines, log: (l) => lines.push(l) }; };

describe('the commands reader leaves the committed table alone', () => {
  it('writes what it read into the ignored file and does not touch the tracked one', () => {
    const { out, local } = tmp();
    // The ordinary build: the same commands as the committed table, read off a
    // newer Claude Code.
    const table = commands.build(bundleWith());
    fs.writeFileSync(out, commands.moduleText({ ...table, readFrom: '2.1.286', readAt: '2026-10-01' }));
    const before = fs.readFileSync(out, 'utf8');
    const { log, lines } = said();
    commands.run({ bin: bundleWith(), out, local, log });
    expect(fs.readFileSync(out, 'utf8')).toBe(before);
    const wrote = JSON.parse(fs.readFileSync(local, 'utf8'));
    expect(wrote.commands.map((c) => c.name)).toEqual(expect.arrayContaining(commands.WANTED));
    expect(lines.join('\n')).not.toMatch(/npm run read:claude/);
  });

  it('says the committed table is behind when the commands themselves differ', () => {
    const { out, local } = tmp();
    fs.writeFileSync(out, commands.moduleText({ readFrom: '2.1.286', readAt: '2026-10-01', commands: [] }));
    const { log, lines } = said();
    // The committed table above holds no commands at all, so this is real drift
    // rather than a clock, and the one line it prints has to name the way out.
    commands.run({ bin: bundleWith(), out, local, log });
    expect(lines.join('\n')).toMatch(/npm run read:claude/);
  });

  it('is quiet when only the version and the date moved, which is most builds', () => {
    // The measured case: seven releases of Claude Code, same fourteen commands.
    // A warning that fires on the clock is noise, and noise trains the reaction
    // it was meant to prevent.
    const { out, local } = tmp();
    const table = commands.build(bundleWith());
    fs.writeFileSync(out, commands.moduleText({ ...table, readFrom: '2.1.286', readAt: '2026-10-01' }));
    const { log, lines } = said();
    commands.run({ bin: bundleWith(), out, local, log });
    expect(lines.join('\n')).not.toMatch(/npm run read:claude/);
  });

  it('does rewrite the tracked table when somebody asks for it in so many words', () => {
    const { out, local } = tmp();
    fs.writeFileSync(out, commands.moduleText({ readFrom: '2.1.286', readAt: '2026-10-01', commands: [] }));
    commands.run({ bin: bundleWith(), out, local, snapshot: true, log: () => {} });
    expect(fs.readFileSync(out, 'utf8')).toContain('"name": "model"');
  });

  it('still stops the build when a command the menu offers has gone', () => {
    // The loud failure is the whole reason this is read and not typed, and it
    // must survive the file it writes moving.
    const { out, local } = tmp();
    fs.writeFileSync(out, commands.moduleText({ readFrom: '2.1.286', readAt: '2026-10-01', commands: [] }));
    expect(() => commands.run({ bin: bundleWith({ drop: ['compact'] }), out, local, log: () => {} }))
      .toThrow(/\/compact/);
  });
});

describe('the models reader leaves the committed table alone', () => {
  it('writes what it read into the ignored file and does not touch the tracked one', () => {
    const { out, local } = tmp();
    fs.writeFileSync(out, models.moduleText({ readFrom: '2.1.286', readAt: '2026-10-01', models: [] }));
    const before = fs.readFileSync(out, 'utf8');
    models.run({ bin: catalogBin(), out, local, log: () => {} });
    expect(fs.readFileSync(out, 'utf8')).toBe(before);
    const wrote = JSON.parse(fs.readFileSync(local, 'utf8'));
    expect(wrote.models.find((m) => m.alias === 'opus')).toMatchObject({ label: 'Opus 5.5' });
  });

  it('does rewrite the tracked table, and its types, when somebody asks', () => {
    const { out, local } = tmp();
    fs.writeFileSync(out, models.moduleText({ readFrom: '2.1.286', readAt: '2026-10-01', models: [] }));
    models.run({ bin: catalogBin(), out, local, snapshot: true, log: () => {} });
    expect(fs.readFileSync(out, 'utf8')).toContain('"label":"Opus 5.5"');
    expect(fs.existsSync(out.replace(/\.mjs$/, '.d.mts'))).toBe(true);
  });
});

describe('the picker prefers what this machine read, and never draws nothing', () => {
  const committed = CLAUDE_MODELS.map((m) => ({ alias: m.alias, id: m.id, label: m.label }));

  it('falls back to the committed table when this machine has read nothing', () => {
    forget();
    expect(claudeModels({ bin: null, local: '/no/such/file.json' }))
      .toMatchObject({ models: committed, source: 'built' });
  });

  it('prefers the file the build wrote on this machine over the committed one', () => {
    forget();
    const { local } = tmp();
    fs.writeFileSync(local, JSON.stringify({
      readFrom: '2.1.293',
      readAt: '2026-10-08',
      models: [{ alias: 'haiku', id: 'claude-haiku-5-5', label: 'Haiku 5.5', defaultLevel: 'medium' }],
    }));
    expect(claudeModels({ bin: null, local })).toMatchObject({
      models: [{ alias: 'haiku', id: 'claude-haiku-5-5', label: 'Haiku 5.5', defaultLevel: 'medium' }],
      readFrom: '2.1.293',
      source: 'read',
    });
  });

  it('ignores a file it cannot read rather than drawing an empty picker', () => {
    forget();
    const { local } = tmp();
    fs.writeFileSync(local, 'this is not json');
    expect(claudeModels({ bin: null, local })).toMatchObject({ models: committed, source: 'built' });
  });

  it('still prefers the installed CLI over both of them', () => {
    forget();
    const { local } = tmp();
    fs.writeFileSync(local, JSON.stringify({ readFrom: '1.0.0', readAt: '2020-01-01', models: [{ alias: 'haiku', id: 'x', label: 'Wrong', defaultLevel: null }] }));
    expect(claudeModels({ bin: catalogBin(), local }).source).toBe('cli');
  });
});

describe('the file the build writes can never be committed or published', () => {
  const ignored = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  it('is gitignored, by the same pattern for both of them', () => {
    expect(ignored).toContain('shared/*.local.json');
  });

  it('is kept out of what npm packs, where shared/**/*.json otherwise sweeps it in', () => {
    expect(pkg.files).toContain('!shared/*.local.json');
  });

  it('is adopted by a command of its own, so the snapshot is a decision', () => {
    expect(pkg.scripts['read:claude']).toMatch(/--snapshot/);
  });

  it('is what the build writes: the build no longer names the tracked file', () => {
    expect(pkg.scripts.build).toContain('read-claude-commands.mjs');
    expect(pkg.scripts.build).not.toContain('--snapshot');
  });
});
