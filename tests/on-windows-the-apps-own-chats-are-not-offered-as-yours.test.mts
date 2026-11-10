// ON WINDOWS THE APP'S OWN CHATS ARE NOT OFFERED AS YOURS.
//
// The import card leaves out Claude Code chats that ran in a temp folder,
// where the app's own scripts and workers run, and chats in a task folder,
// `.claude/worktrees/w-<hex>`, which the inbox already holds. Both rules were
// written with forward slashes and macOS temp paths, /tmp and /var/folders.
// Measured on Windows 11 with Node 24: os.tmpdir() is
// C:\Users\<short name>\AppData\Local\Temp, inside the home folder, a cwd
// there matched neither rule, and C:\repo\.claude\worktrees\w-4b8af9d08f did
// not match the task rule, so both kinds were offered as the person's own.
// os.tmpdir() also gave the 8.3 short name of the home folder while the
// home folder itself came back long, so a path can name the same temp folder
// either way.
//
// On Windows a folder in the temp folder is scratch, compared without case and
// with either separator, unless it sits in a home folder deeper than the temp
// folder, which is how the tests here make a home of their own. Claude Code's
// name for a transcript folder, every other character turned into `-`, is read
// the same way so the app's chats are refused before they are opened.

import { describe, it, expect } from 'vitest';
import { isScratchFolder, isScratchProjectDir, isTaskFolder } from '../main/agent-sessions.mts';

const home = 'C:\\Users\\Jane Doe';
const tmpdir = 'C:\\Users\\JANEDO~1\\AppData\\Local\\Temp';
const longTemp = 'C:\\Users\\Jane Doe\\AppData\\Local\\Temp';
// What the system says the short name stands for.
const realpath = (p) => {
  if (p.toLowerCase() === tmpdir.toLowerCase()) return longTemp;
  throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
};
const win = { platform: 'win32', tmpdir, realpath };

describe('on Windows a temp folder is scratch', () => {
  it('under the temp folder as os.tmpdir() names it', () => {
    expect(isScratchFolder(`${tmpdir}\\agentbox-usage`, home, win)).toBe(true);
    expect(isScratchFolder(tmpdir, home, win)).toBe(true);
  });

  it('under the same temp folder by its long name', () => {
    expect(isScratchFolder(`${longTemp}\\w-1\\repo`, home, win)).toBe(true);
  });

  it('whatever the case and whichever separator', () => {
    expect(isScratchFolder('c:\\users\\janedo~1\\appdata\\local\\temp\\x', home, win)).toBe(true);
    expect(isScratchFolder('C:/Users/Jane Doe/AppData/Local/Temp/x', home, win)).toBe(true);
    expect(isScratchFolder('C:\\USERS\\JANE DOE\\APPDATA\\LOCAL\\TEMP\\', home, win)).toBe(true);
  });

  it('even though the temp folder is inside the home folder', () => {
    expect(isScratchFolder(`${longTemp}\\zero-row-chat`, home, win)).toBe(true);
  });
});

describe('on Windows a folder of her own is hers', () => {
  it('anywhere else in her home folder', () => {
    expect(isScratchFolder(`${home}\\Desktop\\dev\\zero`, home, win)).toBe(false);
    expect(isScratchFolder(`${home}\\AppData\\Local\\Templates`, home, win)).toBe(false);
    expect(isScratchFolder('D:\\work\\repo', home, win)).toBe(false);
  });

  it('when only the name starts like the temp folder', () => {
    expect(isScratchFolder(`${longTemp}orary\\notes`, home, win)).toBe(false);
  });

  it('in a home folder that itself lives in the temp folder', () => {
    const inTemp = `${tmpdir}\\home-1`;
    expect(isScratchFolder(`${inTemp}\\Desktop\\dev\\zero`, inTemp, win)).toBe(false);
    expect(isScratchFolder(`${tmpdir}\\other`, inTemp, win)).toBe(true);
  });

  it('when nothing says what the short name stands for', () => {
    const blind = { platform: 'win32', tmpdir, realpath: () => { throw new Error('ENOENT'); } };
    expect(isScratchFolder(`${tmpdir}\\x`, home, blind)).toBe(true);
    expect(isScratchFolder(`${home}\\Desktop\\x`, home, blind)).toBe(false);
  });
});

describe('on Windows a temp folder set oddly hides nothing of hers', () => {
  const at = (t) => ({ platform: 'win32', tmpdir: t, realpath: (p) => p });

  it('when TEMP is the home folder itself', () => {
    expect(isScratchFolder(`${home}\\Desktop\\dev\\zero`, home, at(home))).toBe(false);
    expect(isScratchFolder(home, home, at(home))).toBe(false);
    expect(isScratchProjectDir('C--Users-Jane-Doe-Desktop-dev-zero', home, at(home))).toBe(false);
  });

  it('when TEMP is a whole drive', () => {
    expect(isScratchFolder('C:\\work\\repo', home, at('C:\\'))).toBe(false);
    expect(isScratchFolder('D:\\work\\repo', home, at('D:'))).toBe(false);
    expect(isScratchProjectDir('C--work-repo', home, at('C:\\'))).toBe(false);
  });

  it('when TEMP sits above the home folder, which still keeps her folders hers', () => {
    expect(isScratchFolder(`${home}\\Desktop\\x`, home, at('C:\\Users'))).toBe(false);
    expect(isScratchFolder('C:\\Users\\Shared\\x', home, at('C:\\Users'))).toBe(true);
  });
});

describe('on Windows a transcript folder in the temp folder is refused unopened', () => {
  it('by either name of the temp folder', () => {
    expect(isScratchProjectDir('C--Users-JANEDO-1-AppData-Local-Temp-agentbox-usage', home, win)).toBe(true);
    expect(isScratchProjectDir('C--Users-Jane-Doe-AppData-Local-Temp-w-1-repo', home, win)).toBe(true);
    expect(isScratchProjectDir('c--users-jane-doe-appdata-local-temp', home, win)).toBe(true);
  });

  it('but not her own folders', () => {
    expect(isScratchProjectDir('C--Users-Jane-Doe-Desktop-dev-zero', home, win)).toBe(false);
    expect(isScratchProjectDir('C--Users-Jane-Doe-AppData-Local-Temporary-notes', home, win)).toBe(false);
    expect(isScratchProjectDir('D--work-repo', home, win)).toBe(false);
  });

  it('nor one in a home folder that lives in the temp folder', () => {
    const inTemp = `${tmpdir}\\home-1`;
    expect(isScratchProjectDir('C--Users-JANEDO-1-AppData-Local-Temp-home-1-Desktop-zero', inTemp, win)).toBe(false);
  });
});

describe('on Windows a task folder is the app\'s own', () => {
  it('with backslashes', () => {
    expect(isTaskFolder('C:\\repo\\.claude\\worktrees\\w-4b8af9d08f', win)).toBe(true);
    expect(isTaskFolder('C:\\repo\\.claude\\worktrees\\w-4b8af9d08f\\main\\x', win)).toBe(true);
    expect(isTaskFolder('C:/repo/.claude/worktrees/w-4b8af9d08f', win)).toBe(true);
  });

  it('but not a worktree Claude Code named, nor one only named like a task', () => {
    expect(isTaskFolder('C:\\repo\\.claude\\worktrees\\upbeat-matsumoto-588a8d', win)).toBe(false);
    expect(isTaskFolder('C:\\repo\\.claude\\worktrees\\w-4b8af9d08f-notes', win)).toBe(false);
    expect(isTaskFolder('C:\\repo\\w-4b8af9d08f', win)).toBe(false);
  });
});

describe('on a Mac and on Linux nothing changes', () => {
  for (const platform of ['darwin', 'linux']) {
    const posix = { platform, tmpdir: '/var/folders/19/abc/T', realpath: (p) => p };
    it(`on ${platform} the temp folders are the ones they were`, () => {
      expect(isScratchFolder('/private/tmp/probe', '/Users/her', posix)).toBe(true);
      expect(isScratchFolder('/var/folders/19/abc/T/run', '/Users/her', posix)).toBe(true);
      expect(isScratchFolder('/Users/her/Desktop/dev/zero', '/Users/her', posix)).toBe(false);
      expect(isScratchProjectDir('-private-tmp-w-1', '/Users/her', posix)).toBe(true);
      expect(isScratchProjectDir('-Users-her-Desktop', '/Users/her', posix)).toBe(false);
    });

    it(`on ${platform} a Windows path is not read as one`, () => {
      expect(isScratchFolder(`${tmpdir}\\x`, '/Users/her', { ...posix, tmpdir })).toBe(false);
      expect(isTaskFolder('C:\\repo\\.claude\\worktrees\\w-4b8af9d08f', posix)).toBe(false);
      expect(isTaskFolder('/r/.claude/worktrees/w-4b8af9d08f', posix)).toBe(true);
    });
  }
});
