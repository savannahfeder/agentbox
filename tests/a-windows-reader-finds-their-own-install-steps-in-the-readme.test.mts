// A WINDOWS READER FINDS THEIR OWN INSTALL STEPS IN THE README (w-5a3af0e1f1).
//
// What broke: on 2026-11-21 someone setting up Agentbox on Windows could not
// work out how from the README. Its Install section was one run of paragraphs
// for every computer at once, and searching it for "Windows" found two
// sentences: that `npm install` adds nothing there, and that this repo packs no
// Windows installer. Neither said what to install first or which commands to
// run. Counted in README.md on main that day: two mentions of Windows as a
// system and no Windows command.
//
// So Install opens with a table that sends each computer to its own section,
// and each section is checked on its own: everything a reader needs is inside
// it, and nothing from another computer is.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { linkOwnBin } from '../scripts/link-own-bin.mjs';

const root = path.join(import.meta.dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
const readme = read('README.md');
const pkg = JSON.parse(read('package.json'));

const DOWNLOAD = 'https://agentbox.ac/download';
const CLONE = 'git clone https://github.com/savannahfeder/agentbox.git';
const start = readme.indexOf('## Install');
const install = readme.slice(start, readme.indexOf('\n## ', start + 1));
const floor = String(pkg.engines.node).match(/>=\s*(\d+(?:\.\d+)*)/)?.[1];

/** A section of Install by its heading, up to the next heading at its level or above. */
function section(text: string, title: RegExp): string | null {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => /^#{3,6} /.test(l) && title.test(l));
  if (at < 0) return null;
  const level = lines[at].match(/^#+/)![0].length;
  const next = lines.findIndex((l, i) => i > at && new RegExp(`^#{1,${level}} `).test(l));
  return lines.slice(at + 1, next < 0 ? undefined : next).join('\n');
}

const windows = section(install, /Install on Windows/) ?? '';
const linux = section(install, /Install on Linux/) ?? '';
const mac = section(install, /Install on a Mac/) ?? '';

describe('finding a section', () => {
  it('reads a heading up to the next one as high, keeping any deeper one inside', () => {
    const text = '### Install on Windows\n\nwin\n\n#### Note\n\nmore\n\n### Install on Linux\n\nlin\n\n## Next';
    expect(section(text, /Install on Windows/)?.trim()).toBe('win\n\n#### Note\n\nmore');
    expect(section(text, /Install on Linux/)?.trim()).toBe('lin');
  });

  it('finds nothing for a computer the text never gives a section', () => {
    expect(section('On Windows, `npm install` adds nothing.', /Install on Windows/)).toBeNull();
  });
});

describe('Install has its own steps for each computer', () => {
  it('gives a Mac, Windows and Linux a section each', () => {
    expect(windows).not.toBe('');
    expect(linux).not.toBe('');
    expect(mac).not.toBe('');
  });

  it('opens with a table that sends each computer to its way in', () => {
    // Where the links land is checked by tests/every-readme-link-lands-somewhere.
    const rows = install.split('\n').filter((l) => /^\| (Mac|Windows|Linux) \|/.test(l));
    expect(rows.map((r) => r.split('|')[1].trim())).toEqual(['Mac', 'Windows', 'Linux']);
    expect(rows[0]).toContain(`(${DOWNLOAD})`);
    expect(rows[1]).toContain('(#install-on-windows)');
    expect(rows[2]).toContain('(#install-on-linux)');
  });

  it('keeps the Mac download above them, where most visitors stop', () => {
    expect(install.indexOf(DOWNLOAD)).toBeGreaterThan(-1);
    expect(install.indexOf(DOWNLOAD)).toBeLessThan(install.indexOf('Install on Windows'));
  });

  it('promises the first run sets up an agent only because setup can install one on every computer', () => {
    expect(install).toMatch(/first run installs one/);
    const harnesses = read('shared/harness-definitions.mts');
    expect(harnesses).toContain("windowsInstaller: { url: 'https://claude.ai/install.ps1'");
    expect(harnesses).toContain("windowsInstaller: { url: 'https://chatgpt.com/codex/install.ps1'");
  });
});

describe('the Windows section, read on its own', () => {
  it('says what to install first, with the Node the package asks for', () => {
    expect(floor).toBeTruthy();
    expect(windows).toContain(`Node ${floor} or newer`);
    expect(windows).toContain('winget install --id Git.Git -e');
    expect(windows).toContain('winget install --id OpenJS.NodeJS.LTS -e');
    // A PowerShell window opened before those installs cannot find either.
    expect(windows).toMatch(/open a new one/);
  });

  it('carries every command from an empty folder to an open app, in order', () => {
    const steps = [CLONE, 'cd agentbox', 'npm install', 'npm start'].map((line) => windows.indexOf(line));
    expect(steps.every((at) => at > -1)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it('says what to do when PowerShell refuses to run npm', () => {
    // Windows PowerShell blocks script files by default on Windows 10 and 11,
    // and `npm` there is npm.ps1.
    expect(windows).toMatch(/running scripts is disabled on this system/);
    expect(windows).toContain('Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser');
  });

  it('says the app is in the Start menu afterwards, which a run from source does on Windows', () => {
    expect(windows).toMatch(/Start menu/);
    expect(read('main/main.mts')).toMatch(/process\.platform === 'win32' && !app\.isPackaged\)\s*\{\s*import\('\.\.\/scripts\/windows-launcher\.mjs'\)/);
  });

  it('does not send a Windows reader to a way in that does not work there', () => {
    // A checkout's `npx agentbox-app` runs through a link npm does not make on
    // Windows, and the download is a Mac app: there is no Windows build target.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-windows-'));
    try {
      expect(linkOwnBin({ appDir: dir, platform: 'win32' }).linked).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    expect(pkg.build.win).toBeUndefined();
    expect(windows).not.toContain('npx agentbox-app');
    expect(windows).not.toContain(DOWNLOAD);
    expect(windows).not.toMatch(/\bsudo\b|\bapt\b|xdg-open|~\/\.local/);
  });
});

describe('the Linux and Mac sections keep to their own computer', () => {
  it('Linux names its build tools and launcher and no Windows step', () => {
    expect(linux).toContain('build-essential');
    expect(linux).toContain('~/.local/bin');
    expect(linux).not.toMatch(/winget|Set-ExecutionPolicy|PowerShell|Start menu/);
  });

  it('a Mac build names no Windows or Linux step', () => {
    expect(mac).toContain(CLONE);
    expect(mac).not.toMatch(/winget|Set-ExecutionPolicy|Start menu|build-essential|\bapt\b/);
  });
});
