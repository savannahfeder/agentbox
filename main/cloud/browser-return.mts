// THE BROWSER'S WAY BACK FROM OPENAI, TAKEN ON THIS COMPUTER FOR A CODEX
// SIGN-IN THAT RUNS IN THE CLOUD.
//
// Codex's browser sign-in sends the browser back to the machine running
// `codex login`, at 127.0.0.1:1455. The browser is here and the command is in
// the cloud, so this listens on that address while she signs in and hands the
// query on: what OpenAI documents doing over SSH for a remote machine. The
// query is a one-time code only the cloud's Codex can spend (it alone holds
// the PKCE secret); no login passes through here.
import http from 'node:http';
import { NAME } from '../../shared/product-name.mjs';

// Where an OpenAI sign-in link sends the browser back, when that is this
// computer's own address; null otherwise.
export function wayBack(link) {
  try {
    const back = new URL(new URL(link).searchParams.get('redirect_uri') || '');
    const port = Number(back.port);
    if (back.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(back.hostname) || !(port > 0)) return null;
    return { port, path: back.pathname };
  } catch {
    return null;
  }
}

const page = (ok) => {
  const line = ok ? 'Signed in to Codex. You can close this tab.' : `That didn’t finish. Go back to ${NAME} and try again.`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ok ? 'Signed in to Codex' : 'Codex sign-in'}</title>`
    + '<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:Canvas;color:CanvasText;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}p{margin:0 24px;text-align:center}</style>'
    + `</head><body><p>${line}</p></body></html>`;
};

// Listens at `port` until closed; anything but `path` is not found, including
// the /cancel a local `codex login` sends whatever holds its port.
// `onReturn(query)` says whether the cloud took it, and the browser is told.
export function listenForWayBack({ port, path, onReturn }) {
  // Every answer closes its connection, so closing the server lets the port
  // go at once and still lets a page being answered reach the browser.
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method !== 'GET' || u.pathname !== path) {
      res.writeHead(404, { 'content-type': 'text/plain', connection: 'close' });
      res.end('Not Found');
      return;
    }
    let ok = false;
    try { ok = !!(await onReturn(u.search.slice(1))); } catch { /* told as not finished */ }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', connection: 'close' });
    res.end(page(ok));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve({ close() { server.close(); server.closeIdleConnections?.(); } });
    });
  });
}
