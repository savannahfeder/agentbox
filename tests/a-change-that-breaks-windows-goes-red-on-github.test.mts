// A CHANGE THAT BREAKS WINDOWS GOES RED ON GITHUB.
//
// The suite ran on macOS and Linux only, so the Windows tests (21 files with
// "windows" in their name, 281 tests, all green on Windows 11 on 2026-11-19)
// ran on nobody's push. A change could break Windows and merge green.
// tests.yml now has a Windows job that runs the files with "windows" in
// their name.
//
// A Windows clone with core.autocrlf checked every file out with CRLF, so a
// test that reads a source file as text saw \r on every line. .gitattributes
// keeps LF on checkout, which is what every committed file already is.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/tests.yml'), 'utf8');
const code = workflow.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
const job = code.match(/^ {2}vitest-windows:\n((?: {4}.*\n|\n)+)/m)?.[1] ?? '';

describe('a change that breaks Windows goes red on GitHub', () => {
  it('has a Windows job', () => {
    expect(job).toMatch(/runs-on: windows-latest/);
  });

  it('runs the files with "windows" in their name, and so does not pass with none', () => {
    expect(job).toMatch(/- run: npx vitest run windows\b/);
    const named = fs.readdirSync(path.join(root, 'tests')).filter((f) => /windows/i.test(f) && /\.test\.m?[jt]s$/.test(f));
    expect(named.length).toBeGreaterThan(0);
  });

  it('installs from the lockfile and pays once for a branch of this repository', () => {
    expect(job).toMatch(/- run: npm ci/);
    expect(job).toContain("if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name != github.repository");
  });

  it('keeps every text file LF on checkout', () => {
    const attrs = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
    expect(attrs).toMatch(/^\* text=auto eol=lf$/m);
  });
});
