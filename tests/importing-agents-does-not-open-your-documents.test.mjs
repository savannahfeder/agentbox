// IMPORTING AGENTS DOES NOT OPEN YOUR DOCUMENTS FOLDER.
//
// What she pressed ran `findAgentFolders`, which queued every directory under
// her home folder two levels deep. Measured on her Mac 2026-08-30: 122 of them,
// and `Desktop`, `Documents` and `Downloads` are three. macOS answers each of
// those with its own consent panel carrying our name.
//
// It bought nothing. The same measurement: zero folders on her Mac outside her
// home set have agents of their own, so the two panels were the entire result.
//
// So a folder inside `~/Desktop` is still offered, because Claude ran there,
// and `~/Documents` is not opened, because nothing says she works in it.
//
// The window is the one `agent-sessions.mjs` already puts on threads, which is
// her own "recent = last few days".

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  claudeProjectFolders, findAgentFolders, readAgentFiles, readFolderAgents,
} from '../main/agent-files.mjs';
import { GUARDED } from '../shared/project-folder-check.mjs';

const DAY = 24 * 60 * 60 * 1000;

/** A throwaway Mac. `shape` is folder -> agent file names, relative to home. */
function makeHome(shape = {}, { ran = null } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'no-documents-'));
  for (const [rel, files] of Object.entries(shape)) {
    const dir = path.join(home, rel, '.claude', 'agents');
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(dir, f), '---\nname: x\n---\n');
  }
  if (ran) {
    const projects = Object.fromEntries(ran.map((f) => [path.join(home, f), {}]));
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ projects }));
  }
  return home;
}

/**
 * Every directory the scan lists, recorded as it runs. A consent panel is what
 *  macOS does when one of these is a guarded folder, so this is the thing the
 *  test is really about and there is no way to observe the panel itself. */
function watchReaddir(run) {
  const real = fs.readdirSync;
  const seen = [];
  fs.readdirSync = (dir, opts) => { seen.push(String(dir)); return real(dir, opts); };
  try { return { out: run(), seen }; } finally { fs.readdirSync = real; }
}

describe('the import scan never reaches into a folder macOS guards', () => {
  it('does not list Documents or Downloads, even with agents sitting in them', () => {
    const home = makeHome({
      'Documents/secret-project': ['a.md'],
      'Downloads/some-download': ['b.md'],
      'dev/mine': ['c.md'],
    });
    const { out, seen } = watchReaddir(() => findAgentFolders({ home }));
    expect(out.map((f) => f.name)).toEqual(['mine']);
    for (const name of ['Documents', 'Downloads', 'Desktop']) {
      const guardedDir = path.join(home, name);
      expect(seen.filter((d) => d === guardedDir || d.startsWith(`${guardedDir}/`))).toEqual([]);
    }
  });

  it('holds the whole guarded list, not the three she happened to name', () => {
    const shape = {};
    for (const name of GUARDED) shape[`${name}/thing`] = ['a.md'];
    const home = makeHome(shape);
    expect(findAgentFolders({ home })).toEqual([]);
  });

  it('still offers a folder inside Desktop when Claude Code has run there', () => {
    const home = makeHome(
      { 'Desktop/dev/astral-desktop': ['a.md', 'b.md'] },
      { ran: ['Desktop/dev/astral-desktop'] },
    );
    const got = findAgentFolders({ home });
    expect(got.map((f) => f.short)).toEqual(['~/Desktop/dev/astral-desktop']);
    expect(got[0].count).toBe(2);
  });

  it('reaches that folder by name and nothing around it', () => {
    const home = makeHome(
      { 'Desktop/dev/astral-desktop': ['a.md'], 'Desktop/dev/private-thing': ['b.md'] },
      { ran: ['Desktop/dev/astral-desktop'] },
    );
    const { out, seen } = watchReaddir(() => findAgentFolders({ home }));
    expect(out.map((f) => f.name)).toEqual(['astral-desktop']);
    // The one folder it opened inside Desktop is that project's agents folder.
    const inside = seen.filter((d) => d.startsWith(`${path.join(home, 'Desktop')}/`));
    expect(inside).toEqual([path.join(home, 'Desktop/dev/astral-desktop/.claude/agents')]);
  });

  it('reads the folders out of Claude Code\'s own file, skipping temp and worktrees', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-json-'));
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({
      projects: {
        [path.join(home, 'dev/real')]: {},
        [path.join(home, 'Desktop/claude/.claude/worktrees/upbeat-matsumoto')]: {},
        '/private/tmp/speedsize-run-12': {},
        '/tmp/bench-claude-1': {},
        'not-an-absolute-path': {},
        [home]: {},
      },
    }));
    expect(claudeProjectFolders({ home })).toEqual([path.join(home, 'dev/real')]);
  });

  it('answers with nothing rather than throwing when there is no such file', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'no-claude-json-'));
    expect(claudeProjectFolders({ home })).toEqual([]);
    fs.writeFileSync(path.join(home, '.claude.json'), 'not json at all');
    expect(claudeProjectFolders({ home })).toEqual([]);
  });
});

describe('the four files from March are not on the card', () => {
  const age = (home, rel, file, days) => {
    const p = path.join(home, rel, '.claude', 'agents', file);
    const t = new Date(Date.now() - days * DAY);
    fs.utimesSync(p, t, t);
  };

  it('drops an agent file nobody has touched in months', () => {
    const home = makeHome({ '.': ['leon-okafor-qa.md', 'written-today.md'] });
    age(home, '.', 'leon-okafor-qa.md', 160);
    expect(readAgentFiles({ home }).user.map((a) => a.name)).toEqual(['x']);
    expect(readAgentFiles({ home }).user).toHaveLength(1);
  });

  it('drops the same file out of a project folder and out of the count', () => {
    const home = makeHome({ 'dev/mine': ['old.md', 'new.md'] }, { ran: ['dev/mine'] });
    age(home, 'dev/mine', 'old.md', 160);
    expect(readFolderAgents(path.join(home, 'dev/mine'))).toHaveLength(1);
    // The heading's number and the list under it are the same fact said twice.
    expect(findAgentFolders({ home })[0].count).toBe(1);
  });

  it('takes the folder off the card entirely when everything in it is old', () => {
    const home = makeHome({ 'dev/mine': ['old.md'] }, { ran: ['dev/mine'] });
    age(home, 'dev/mine', 'old.md', 160);
    expect(findAgentFolders({ home })).toEqual([]);
    expect(readAgentFiles({ home, folder: path.join(home, 'dev/mine') }).project).toEqual([]);
  });

  it('keeps a file written a few days ago, which is the window she set', () => {
    const home = makeHome({ '.': ['a.md'] });
    age(home, '.', 'a.md', 3);
    expect(readAgentFiles({ home }).user).toHaveLength(1);
  });
});
