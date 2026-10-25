// THE SKILLS AGENTS USE WHILE BUILDING AGENTBOX LOAD, AND STAY OUT OF THE APP.
//
// w-a358961e3e, 2026-10-15. Five skills adapted from pstack (trim-comments,
// unslop, blast-radius, correct, interrogate) were added for the agents that
// work on this repository, in the maintainer's words "my own skill set that
// the agents use whilst building Agentbox", not a feature of the app. Claude
// Code skips a skill whose front matter is malformed without saying so, so a
// typo would leave an agent without it and nobody would notice. Measured the
// same day: the app's code was 43% comment lines (main 43%, shared 48%,
// renderer/src 37%), which is what trim-comments is for.
//
// What is pinned:
//   - every skill in .claude/skills has front matter Claude Code reads, named
//     for its folder, with a description under the 1024-character limit;
//   - the three everyday skills can be picked by an agent on its own, and the
//     two expensive ones (correct, interrogate) run only when someone asks;
//   - interrogate runs Codex read-only and never hands it a key;
//   - nothing in the app imports them, and neither package ships them.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skills = path.join(root, '.claude', 'skills');
const ours = ['trim-comments', 'unslop', 'blast-radius', 'correct', 'interrogate'];

const frontMatter = (name) => {
  const text = fs.readFileSync(path.join(skills, name, 'SKILL.md'), 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return null;
  return Object.fromEntries(m[1].split('\n').map((line) => {
    const i = line.indexOf(':');
    return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
  }));
};

describe('skills Claude Code can find', () => {
  it('has all five', () => {
    for (const name of ours) expect(fs.existsSync(path.join(skills, name, 'SKILL.md')), name).toBe(true);
  });

  it('names every skill in the folder for its folder, with a description that fits', () => {
    for (const name of fs.readdirSync(skills)) {
      const fm = frontMatter(name);
      expect(fm, name).not.toBeNull();
      expect(fm.name, name).toBe(name);
      expect(fm.description?.length, name).toBeGreaterThan(40);
      expect(fm.description.length, name).toBeLessThanOrEqual(1024);
    }
  });

  it('lets an agent reach for the everyday three on its own', () => {
    for (const name of ['trim-comments', 'unslop', 'blast-radius']) {
      expect(frontMatter(name)['disable-model-invocation'], name).toBeUndefined();
    }
  });

  it('runs the two expensive ones only when someone asks', () => {
    for (const name of ['correct', 'interrogate']) {
      expect(frontMatter(name)['disable-model-invocation'], name).toBe('true');
    }
  });
});

describe('interrogate', () => {
  const text = () => fs.readFileSync(path.join(skills, 'interrogate', 'SKILL.md'), 'utf8');

  it('runs Codex read-only', () => {
    const calls = text().split('\n').filter((l) => /^\s*codex exec /.test(l));
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toMatch(/ -s read-only /);
  });

  it('never hands Codex a key', () => {
    expect(text()).not.toMatch(/(OPENAI|ANTHROPIC)_API_KEY=/);
  });
});

describe('tools for building the app, not part of it', () => {
  it('is imported by nothing in the app', () => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const dir of ['main', 'shared', 'renderer/src', 'mcp', 'bin']) {
      for (const file of walk(path.join(root, dir)).filter((f) => /\.(mjs|cjs|js|ts|tsx)$/.test(f))) {
        const src = fs.readFileSync(file, 'utf8');
        for (const name of ours) expect(src, file).not.toContain(`.claude/skills/${name}`);
      }
    }
  });

  it('is in neither package the app ships', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    for (const list of [pkg.files, pkg.build.files, pkg.build.asarUnpack]) {
      expect(list.some((f) => f.includes('.claude'))).toBe(false);
    }
  });
});
