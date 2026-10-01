// Browser driver for the repeatable inline-link regression, never the live app.
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
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
    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, 50));
      const result = await win.webContents.executeJavaScript('window.regression');
      if (result) { console.log('LINK_RESULT=' + JSON.stringify(result)); app.exit(0); return; }
    }
    throw new Error('Link probe timed out');
  } catch (error) { console.error(error); app.exit(1); }
});
