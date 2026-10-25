// THE RENDERER'S TYPES COMPILE, AND THEY STILL REFUSE WHAT THEY SHOULD.
//
// What broke: launch QA ran
// `node node_modules/typescript/bin/tsc --noEmit -p renderer/tsconfig.json`
// and got 19 errors, every one of them already on main (w-a170ad72b8). Four
// shared modules the screen imports had no declaration beside them, so
// `bridge-map`, `codex-modes` and `schemes` all came through as `any`;
// `unleaked` was exported by shared/agents.mjs and missing from its .d.mts;
// and `isSaid` in item-thread.ts returned a plain boolean, so eleven reads of
// `.who` and `.text` were taken off an event that might have been a tool call.
// Nothing crashed, because Vite does not typecheck: the renderer built and
// shipped with all 19 standing.
//
// How it is measured: the same command the QA run used, exit code and output.
// A compiler with nothing to say is the whole of the first test.
//
// The second test is there because the first one is cheap to satisfy
// dishonestly. `as any` on four imports and one widened union clears 19 errors
// and loses the types that were the point, so a fixture of deliberate misuse
// is compiled too, and every line of it must still be refused.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');

// tsc exits non-zero when it has anything to say, so the diagnostics come back
// on stdout either way and the exit code is read off the error.
function typecheck(project) {
  try {
    execFileSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false', '-p', project], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return '';
  } catch (err) {
    return `${err.stdout ?? ''}${err.stderr ?? ''}`.trim();
  }
}

const lines = (out) => out.split('\n').filter((l) => /error TS\d+:/.test(l));

describe('the renderer typechecks clean', () => {
  it('says nothing at all about renderer/src', () => {
    const out = typecheck(join(root, 'renderer', 'tsconfig.json'));
    expect(lines(out)).toEqual([]);
    expect(out).toBe('');
  });

  // THE BOUNDARY EITHER SIDE OF THE FIX. The errors were not spread evenly:
  // seven of the 19 were one fault, a shared .mjs the screen imports with no
  // .d.mts beside it. A new one of those would be a new TS7016, so it is named
  // here in words rather than left to a code in a wall of output.
  it('has a declaration beside every shared module the screen imports', () => {
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
      }
    };
    walk(join(root, 'renderer', 'src'));

    const imported = new Set();
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/from '(?:\.\.\/)+shared\/([\w.-]+)\.mjs'/g)) imported.add(m[1]);
    }
    // The screen does import from shared/, so an empty set would be this test
    // passing by finding nothing.
    expect(imported.size).toBeGreaterThan(5);

    const untyped = [...imported].filter((name) => !existsSync(join(root, 'shared', `${name}.d.mts`))).sort();
    expect(untyped).toEqual([]);
  });

  // AND THE CASE THAT MUST NOT COMPILE. Each marked line of the fixture names
  // the code TypeScript owes it; `any` anywhere in the chain and the line goes
  // quiet, which is the failure this catches.
  it('still refuses the misuse the fixture spells out', () => {
    const fixture = join(here, 'fixtures', 'typecheck-refusals.ts');
    const wanted = readFileSync(fixture, 'utf8')
      .split('\n')
      .map((line, i) => {
        const m = line.match(/\/\/ (TS\d+)$/);
        return m ? `${i + 1}:${m[1]}` : null;
      })
      .filter(Boolean);
    expect(wanted.length).toBe(9);

    const out = typecheck(join(here, 'fixtures', 'typecheck-refusals.tsconfig.json'));
    const got = lines(out)
      .map((l) => {
        const m = l.match(/typecheck-refusals\.ts\((\d+),\d+\): error (TS\d+):/);
        return m ? `${m[1]}:${m[2]}` : l;
      })
      .sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0]));
    expect(got).toEqual(wanted);
  });
});
