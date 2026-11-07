// THE BROWSER VERSION OPENS THE COMPUTER'S OWN FOLDER WINDOW.
//
// What broke: in a browser tab, New project drew a picker of our own (a path
// box and a list of folders) because a tab cannot open the system's folder
// window. On seeing it: "these look very weird, we should be using the normal
// file selector that's built into the OS". The server behind the tab runs on
// the same computer, so it opens the system's window itself: `choose folder`
// on a Mac, zenity on Linux. Only where neither exists does the drawn picker
// stand in.
//
// Measured by these tests failing before the change: there was no
// osOpenDialog, and nodeHost answered noDialog whatever it was given.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { osOpenDialog } from '../main/os-folder-window.mts';
import { nodeHost } from '../main/serve.mts';

const recorder = (answer) => {
  const calls = [];
  const run = async (cmd, args) => { calls.push({ cmd, args }); return answer(cmd, args); };
  return { calls, run };
};

describe('on a Mac', () => {
  it('asks for a folder with the title and the starting folder', async () => {
    const { calls, run } = recorder(() => ({ code: 0, out: '/Users/a/code/app/\n' }));
    const r = await osOpenDialog({ title: 'Pick a project folder', properties: ['openDirectory'], defaultPath: '/Users/a/code' }, { platform: 'darwin', run });
    expect(r).toEqual({ canceled: false, filePaths: ['/Users/a/code/app'] });
    expect(calls[0].cmd).toBe('osascript');
    const script = calls[0].args.join(' ');
    expect(script).toMatch(/choose folder with prompt "Pick a project folder"/);
    expect(script).toMatch(/default location POSIX file "\/Users\/a\/code"/);
  });

  it('asks for a file when a file is wanted', async () => {
    const { calls, run } = recorder(() => ({ code: 0, out: '/Users/a/pic.png\n' }));
    const r = await osOpenDialog({ title: 'Pick a picture', properties: ['openFile'] }, { platform: 'darwin', run });
    expect(r.filePaths).toEqual(['/Users/a/pic.png']);
    expect(calls[0].args.join(' ')).toMatch(/choose file with prompt/);
  });

  it('reads Cancel as cancelled, not as an error', async () => {
    const { run } = recorder(() => ({ code: 1, out: '' }));
    expect(await osOpenDialog({ properties: ['openDirectory'] }, { platform: 'darwin', run })).toEqual({ canceled: true, filePaths: [] });
  });

  it('keeps a quote in the title from ending the script', async () => {
    const { calls, run } = recorder(() => ({ code: 0, out: '/x\n' }));
    await osOpenDialog({ title: 'Where is "it"?', properties: ['openDirectory'] }, { platform: 'darwin', run });
    expect(calls[0].args.join(' ')).toMatch(/prompt "Where is \\"it\\"\?"/);
  });
});

describe('on Linux', () => {
  it('uses zenity when it is there', async () => {
    const { calls, run } = recorder(() => ({ code: 0, out: '/home/a/app\n' }));
    const r = await osOpenDialog({ title: 'Pick a project folder', properties: ['openDirectory'], defaultPath: '/home/a' }, { platform: 'linux', run, has: (c) => c === 'zenity' });
    expect(r).toEqual({ canceled: false, filePaths: ['/home/a/app'] });
    expect(calls[0].cmd).toBe('zenity');
    expect(calls[0].args).toEqual(expect.arrayContaining(['--file-selection', '--directory', '--title=Pick a project folder', '--filename=/home/a/']));
  });

  it('answers null when there is no chooser to open, so the drawn picker stands in', async () => {
    const { calls, run } = recorder(() => ({ code: 0, out: '' }));
    expect(await osOpenDialog({ properties: ['openDirectory'] }, { platform: 'linux', run, has: () => false })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('the browser server', () => {
  it('uses the system window it is given', async () => {
    const host = nodeHost({ osDialog: async () => ({ canceled: false, filePaths: ['/Users/a/app'] }) });
    expect(await host.dialog.showOpenDialog(null, { properties: ['openDirectory'] })).toEqual({ canceled: false, filePaths: ['/Users/a/app'] });
  });

  it('falls back to the drawn picker when the system has none', async () => {
    const host = nodeHost({ osDialog: async () => null });
    expect((await host.dialog.showOpenDialog(null, {})).noDialog).toBe(true);
  });

  it('is given the real one only by the command that starts it', () => {
    expect(fs.readFileSync(new URL('../bin/agentbox.mjs', import.meta.url), 'utf8')).toMatch(/bootHeadless\(\{[^}]*osDialog: osOpenDialog/);
  });
});
