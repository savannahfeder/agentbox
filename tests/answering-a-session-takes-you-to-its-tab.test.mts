// ANSWERING A SESSION TAKES YOU TO ITS TAB.
//
// The founder on w-34f79ab66e (2026-11-23), reading "Allow or deny it in the
// terminal Codex is running in": "Is there a way to link to that or give easy
// access? If it just tells you, it's a little less great than if it can
// actually bring it to you." Before this, "Take me to it" brought the whole app
// forward and left her to find the tab, and a Codex session in a terminal had no
// way there at all. Everything below runs on recorded ps, tmux and AppleScript
// answers, so nothing on this machine is opened or focused.

import { describe, it, expect } from 'vitest';
import { appOf, bringToFront, codexProcessFor, inTmux, parsePs, tabScript, ttyPath } from '../main/bring-to-front.mts';
import { revealCodex } from '../main/codex-live.mts';

const PS = [
  '    1     0 ??       /sbin/launchd',
  '  500     1 ??       /System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal',
  '  510   500 ttys004  login -pf you',
  '  520   510 ttys004  -zsh',
  '  530   520 ttys004  node /usr/local/bin/codex',
  '  531   530 ttys004  /usr/local/lib/node_modules/@openai/codex/vendor/codex/codex',
  '  600     1 ??       /Applications/iTerm.app/Contents/MacOS/iTerm2',
  '  610   600 ttys007  -zsh',
  '  620   610 ttys007  claude',
  '  700     1 ??       tmux new-session -d -s work',
  '  710   700 ttys009  -zsh',
  '  720   710 ttys009  /opt/homebrew/bin/codex resume 01a2-abc',
  '  800   600 ttys010  tmux attach -t work',
  '  900     1 ??       /Applications/Codex.app/Contents/Resources/codex app-server --listen',
  '  910   900 ??       /bin/bash -lc npm test',
].join('\n');
const table = parsePs(PS);

function recorder(answers: Record<string, string | Error>) {
  const calls: string[][] = [];
  const exec = async (file: string, args: string[]) => {
    calls.push([file, ...args]);
    const key = Object.keys(answers).find((k) => [file, ...args].join(' ').includes(k));
    const a = key ? answers[key] : '';
    if (a instanceof Error) throw a;
    return a;
  };
  return { exec, calls };
}

describe('reading where a session runs', () => {
  it('finds the app a process runs inside, Terminal and iTerm included', () => {
    expect(appOf(table, 531)).toEqual({ path: '/System/Applications/Utilities/Terminal.app', name: 'Terminal' });
    expect(appOf(table, 620)?.name).toBe('iTerm');
    expect(appOf(table, 720)).toBeNull();
  });
  it('knows a process inside tmux from one that is not', () => {
    expect(inTmux(table, 720)).toBe(true);
    expect(inTmux(table, 531)).toBe(false);
    expect(inTmux(table, 700)).toBe(false);
  });
  it('turns ps terminal names into device paths, and none into none', () => {
    expect(ttyPath('ttys004')).toBe('/dev/ttys004');
    expect(ttyPath('??')).toBeNull();
    expect(ttyPath('pts/3')).toBe('/dev/pts/3');
  });
});

describe('the Codex process a session runs in', () => {
  it('the one naming the session wins', () => {
    expect(codexProcessFor(table, new Map(), { sessionId: '01a2-abc', cwd: '/x' })).toBe(720);
  });
  it('else the innermost Codex started in the session folder, never its service', () => {
    const cwds = new Map([[530, '/Users/you/dev/shop'], [531, '/Users/you/dev/shop'], [900, '/Users/you/dev/shop']]);
    expect(codexProcessFor(table, cwds, { sessionId: 'other', cwd: '/Users/you/dev/shop' })).toBe(531);
  });
  it('none in another folder', () => {
    expect(codexProcessFor(table, new Map([[531, '/elsewhere']]), { sessionId: 'other', cwd: '/Users/you/dev/shop' })).toBeNull();
  });
});

describe('bringing it to the front on a Mac', () => {
  it('selects the Terminal tab holding the session', async () => {
    const r = recorder({ '/bin/ps': PS, osascript: 'ok' });
    expect(await bringToFront(531, { exec: r.exec, platform: 'darwin' })).toEqual({ ok: true, name: 'Terminal' });
    const script = r.calls.find((c) => c[0] === '/usr/bin/osascript')![2];
    expect(script).toContain('tell application "Terminal"');
    expect(script).toContain('if tty of t is "/dev/ttys004"');
    expect(r.calls.some((c) => c[0] === '/usr/bin/open')).toBe(false);
  });
  it('selects the iTerm session holding a Claude Code session', async () => {
    const r = recorder({ '/bin/ps': PS, osascript: 'ok' });
    expect(await bringToFront(620, { exec: r.exec, platform: 'darwin' })).toEqual({ ok: true, name: 'iTerm' });
    expect(r.calls.find((c) => c[0] === '/usr/bin/osascript')![2]).toContain('if tty of s is "/dev/ttys007"');
  });
  it('inside tmux: selects the pane, then the tab showing that tmux session', async () => {
    const r = recorder({ '/bin/ps': PS, 'list-panes': '/dev/ttys009 work:2.1\n/dev/ttys011 work:0.0', 'list-clients': '800 /dev/ttys010', osascript: 'ok' });
    expect(await bringToFront(720, { exec: r.exec, platform: 'darwin' })).toEqual({ ok: true, name: 'iTerm' });
    expect(r.calls).toContainEqual(['tmux', 'select-window', '-t', 'work:2']);
    expect(r.calls).toContainEqual(['tmux', 'select-pane', '-t', 'work:2.1']);
    expect(r.calls.find((c) => c[0] === '/usr/bin/osascript')![2]).toContain('"/dev/ttys010"');
  });
  it('when the app will not be told which tab, the app still comes up', async () => {
    const r = recorder({ '/bin/ps': PS, osascript: new Error('not allowed') });
    expect(await bringToFront(531, { exec: r.exec, platform: 'darwin' })).toEqual({ ok: true, name: 'Terminal' });
    expect(r.calls).toContainEqual(['/usr/bin/open', '-a', '/System/Applications/Utilities/Terminal.app']);
  });
  it('a process that has gone says so and opens nothing', async () => {
    const r = recorder({ '/bin/ps': PS });
    expect((await bringToFront(4242, { exec: r.exec, platform: 'darwin' })).ok).toBe(false);
    expect(r.calls.filter((c) => c[0] !== '/bin/ps')).toEqual([]);
  });
});

describe('a Codex row, end to end', () => {
  it('a terminal session is taken to its tab', async () => {
    const brought: number[] = [];
    const out = await revealCodex({ app: 'Codex in a terminal', sessionId: '01a2-abc', cwd: '/x' }, {
      ps: async () => PS, cwds: async () => new Map(), bring: async (pid) => { brought.push(pid); return { ok: true, name: 'iTerm' }; },
    });
    expect(out).toEqual({ ok: true, name: 'iTerm' });
    expect(brought).toEqual([720]);
  });
  it('a closed terminal says where to look instead', async () => {
    const out = await revealCodex({ app: 'Codex in a terminal', sessionId: 'gone', cwd: '/nowhere' }, { ps: async () => PS, cwds: async () => new Map(), bring: async () => ({ ok: true, name: 'x' }) });
    expect(out).toEqual({ ok: false, reason: 'That Codex has closed. Switch to the terminal it is running in to answer it.' });
  });
  it('a Codex app session opens the Codex app', async () => {
    const opened: string[] = [];
    expect(await revealCodex({ app: 'Codex app', sessionId: 's', cwd: '/x' }, { platform: 'darwin', open: async (n) => { opened.push(n); return true; } })).toEqual({ ok: true, name: 'Codex' });
    expect(opened).toEqual(['Codex']);
  });
});

describe('the AppleScript', () => {
  it('quotes the device path it looks for', () => {
    expect(tabScript('iTerm', '/dev/ttys0"1')).toContain('"/dev/ttys0\\"1"');
  });
});
