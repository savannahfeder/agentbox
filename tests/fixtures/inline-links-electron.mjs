// Browser driver for the repeatable inline-link regression, never the live app.
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { waitFor } from '../waiting.mjs';
const dir = process.argv[2];
app.setPath('userData', path.join(dir, 'profile'));
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
    await win.loadFile(path.join(dir, 'index.html'));
    await win.webContents.executeJavaScript(`window.resolves = []; window.zero = {
      itemHistory: async () => ({ok:true,lines:[]}), sessionTrace: async () => ({sessions:[]}), codeChange: async () => ({ok:false}),
      openArtifact: async p => { window.resolves.push(p); return {ok:false,error:'File could not be opened.'}; },
      onChanged: () => () => {}, commandCatalog: async () => ({commands:[]}), compactionStatus: async () => null
    }; void 0;`);
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(dir, 'probe.js'), 'utf8'));
    // The wait is on the probe, not on a count of turns of a loop: a hundred
    // 50ms turns came to about five seconds of a quiet machine, and the probe's
    // own waits are a second of that, so a machine a few times slow killed a
    // probe that was working.
    let result;
    try {
      result = await waitFor('the link probe to finish', () => win.webContents.executeJavaScript('window.regression'), { every: 50 });
    } catch (slow) {
      const step = await win.webContents.executeJavaScript('window.step ?? null');
      throw new Error(`${slow.message}: it was waiting on ${step}`);
    }
    console.log('LINK_RESULT=' + JSON.stringify(result));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
