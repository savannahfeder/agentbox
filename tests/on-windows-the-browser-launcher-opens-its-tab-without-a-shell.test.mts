// ON WINDOWS THE BROWSER LAUNCHER OPENS ITS TAB WITHOUT A SHELL.
//
// Measured on Windows Server 2022: `node bin/agentbox.mjs` opened the tab with
// `spawn('start', [url], { shell: true })`, and Node 24 printed DEP0190 on
// every launch. Through cmd a `&` in the address also ends the command there.
// Windows now hands the whole address to url.dll as one argument, with no shell.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { browserLauncher } from '../main/open-in-browser.mts';

const URL_ = 'http://127.0.0.1:7777/?token=abc&from=launcher';

describe('the command that opens the tab', () => {
  it('on Windows is url.dll with the whole address as one argument', () => {
    expect(browserLauncher(URL_, 'win32')).toEqual({ cmd: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', URL_] });
  });
  it('on a Mac is open', () => {
    expect(browserLauncher(URL_, 'darwin')).toEqual({ cmd: 'open', args: [URL_] });
  });
  it('on Linux is xdg-open', () => {
    expect(browserLauncher(URL_, 'linux')).toEqual({ cmd: 'xdg-open', args: [URL_] });
  });
});

describe('bin/agentbox.mjs', () => {
  const src = fs.readFileSync(new URL('../bin/agentbox.mjs', import.meta.url), 'utf8');
  it('starts the browser through browserLauncher and never through a shell', () => {
    expect(src).toContain('browserLauncher(');
    expect(src).not.toMatch(/shell:\s*(true|process\.platform)/);
  });
});
