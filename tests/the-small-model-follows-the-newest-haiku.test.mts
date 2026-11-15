// THE SMALL MODEL FOLLOWS THE NEWEST HAIKU (w-bb45118b10).
//
// Every small call (naming rows, catching up, Auto's routing) ran on
// `claude-haiku-4-5-20251001`, a dated id, while the Claude Code installed here
// already offered Haiku 5.5 under the alias `haiku`
// (shared/claude-models.generated.mts). A pinned id never moves to a newer
// model, and when it is retired every small call fails over to Codex or to no
// answer. The alias is what Claude Code moves along as models come out.
//
// Codex has no alias, and its small calls ran on whatever big model Codex
// defaults to. Its own model list (models_cache.json, which the CLI keeps
// current) describes each model, so the small call takes the newest one listed
// as fast or small, and asks again on Codex's default if that model refuses.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NAME_MODEL, askSmallModel } from '../main/row-label.mts';
import { codexSmallModel } from '../main/codex-models.mts';
import { harnessFor } from '../main/harnesses.mts';
import { CLAUDE_MODELS } from '../shared/claude-models.generated.mts';

describe('the small model', () => {
  it('is named by the alias Claude Code keeps current, not a dated id', () => {
    expect(NAME_MODEL).toBe('haiku');
  });

  it('is an alias the installed Claude Code offers', () => {
    expect(CLAUDE_MODELS.map((m: { alias?: string }) => m.alias)).toContain(NAME_MODEL);
  });

  it('is what a small call passes to Claude Code', () => {
    const args = harnessFor('claude').smallModelArgs('name this row', NAME_MODEL);
    expect(args[args.indexOf('--model') + 1]).toBe('haiku');
  });

});

const cache = JSON.parse(fs.readFileSync(new URL('./fixtures/codex-models-cache.json', import.meta.url), 'utf8'));
const row = (slug: string, description: string, priority: number, visibility = 'list') => ({ slug, display_name: slug, description, priority, visibility });

describe('the small model on Codex', () => {
  it('is the newest model its login lists as fast or small', () => {
    expect(codexSmallModel({ home: '/x', read: () => cache })).toBe('gpt-5.6-luna');
  });

  it('moves to a newer small model as soon as the list has one', () => {
    const newer = { models: [row('gpt-7-luna', 'Fast and affordable agentic coding model.', 4), ...cache.models] };
    expect(codexSmallModel({ home: '/x', read: () => newer })).toBe('gpt-7-luna');
  });

  it('is never a hidden model, however fast it says it is', () => {
    expect(codexSmallModel({ home: '/x', read: () => ({ models: [row('gpt-reserve', 'Fast and affordable.', 1, 'hide'), row('gpt-big', 'Frontier model.', 2)] }) })).toBeNull();
  });

  it('is nothing, so Codex picks, when the list names no small model or cannot be read', () => {
    expect(codexSmallModel({ home: '/x', read: () => ({ models: [row('gpt-big', 'Frontier model.', 1)] }) })).toBeNull();
    expect(codexSmallModel({ home: '/x', read: () => null })).toBeNull();
  });

  it('is passed to codex exec ahead of the prompt, and left out when there is none', () => {
    const args = harnessFor('codex').smallModelArgs('name this row', 'gpt-5.6-luna');
    expect(args.slice(-3)).toEqual(['-m', 'gpt-5.6-luna', 'name this row']);
    expect(harnessFor('codex').smallModelArgs('name this row', null)).not.toContain('-m');
  });
});

describe('a small call on Codex whose small model refuses', () => {
  let dir: string;
  afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

  const fakeCodex = (script: string) => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'small-codex-'));
    fs.writeFileSync(path.join(dir, 'models_cache.json'), JSON.stringify(cache));
    const bin = path.join(dir, 'codex');
    fs.writeFileSync(bin, `#!/usr/bin/env node\nconst args = process.argv.slice(2);\n${script}\n`, { mode: 0o755 });
    return bin;
  };

  it('asks again on Codex\'s default model and keeps that answer', async () => {
    const bin = fakeCodex("if (args.includes('-m')) { process.stderr.write('model not available'); process.exit(1); } process.stdout.write('A name');");
    const answer = await askSmallModel('name this', (t) => t.trim(), { engine: 'codex', codexBin: bin, env: { ...process.env, CODEX_HOME: dir }, timeoutMs: 10_000 });
    expect(answer).toBe('A name');
  });

  it('uses the small model when it answers', async () => {
    const bin = fakeCodex("process.stdout.write(args.includes('-m') ? args[args.indexOf('-m') + 1] : 'default');");
    const answer = await askSmallModel('name this', (t) => t.trim(), { engine: 'codex', codexBin: bin, env: { ...process.env, CODEX_HOME: dir }, timeoutMs: 10_000 });
    expect(answer).toBe('gpt-5.6-luna');
  });

  it('does not wait out a second deadline after the first ran out', async () => {
    const bin = fakeCodex("setTimeout(() => {}, 60_000);");
    const started = Date.now();
    const answer = await askSmallModel('name this', (t) => t.trim(), { engine: 'codex', codexBin: bin, env: { ...process.env, CODEX_HOME: dir }, timeoutMs: 1_000 });
    expect(answer).toBe('');
    expect(Date.now() - started).toBeLessThan(1_900);
  });
});
