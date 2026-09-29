// Does a design page's picture update when the file on disk is replaced under
// the same name? Mirrors main.mjs: a standard+secure scheme, served with
// net.fetch(file://), the page in an iframe inside a file:// app window, and
// "reopening" is pointing the frame at the page again. Hidden window only.
const { app, BrowserWindow, protocol, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const NO_STORE = process.argv.includes('--no-store');
const dir = path.join(__dirname, 'files');
protocol.registerSchemesAsPrivileged([{ scheme: 'probe-doc', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

setTimeout(() => { console.log('probe gave up'); process.exit(2); }, 40000);
app.whenReady().then(async () => {
  protocol.handle('probe-doc', async (req) => {
    const file = path.join(dir, decodeURIComponent(new URL(req.url).pathname));
    const res = await net.fetch(pathToFileURL(file).toString());
    if (!NO_STORE) return res;
    const headers = new Headers(res.headers);
    headers.set('cache-control', 'no-store');
    return new Response(res.body, { status: res.status, headers });
  });
  fs.writeFileSync(path.join(dir, 'page.html'), `<img id="i" src="shot.png"><script>
    const i = document.getElementById('i');
    const tell = () => parent.postMessage(i.naturalWidth, '*');
    i.complete ? tell() : (i.onload = tell, i.onerror = () => parent.postMessage(-1, '*'));
  </script>`);
  fs.copyFileSync(path.join(__dirname, 'old.png'), path.join(dir, 'shot.png'));
  fs.writeFileSync(path.join(__dirname, 'app.html'), '<iframe id="f" sandbox="allow-scripts allow-same-origin"></iframe>');

  const win = new BrowserWindow({ show: false, webPreferences: { webSecurity: true } });
  await win.loadFile(path.join(__dirname, 'app.html'));
  const open = () => win.webContents.executeJavaScript(`new Promise((done) => {
    const old = document.getElementById('f');
    const f = document.createElement('iframe');
    f.id = 'f'; f.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    const on = (e) => { window.removeEventListener('message', on); done(e.data); };
    window.addEventListener('message', on);
    setTimeout(() => done('timeout'), 8000);
    old.replaceWith(f); f.src = 'probe-doc://file/page.html';
  })`);
  const first = await open();
  fs.copyFileSync(path.join(__dirname, 'new.png'), path.join(dir, 'shot.png'));
  const second = await open();
  console.log(JSON.stringify({ noStore: NO_STORE, first, second, onDiskNow: 3118 }));
  app.quit();
});
