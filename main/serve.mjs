// THE SECOND FRONT DOOR: the same app, answering a browser tab.
//
// Agentbox is two halves. The screen, and the half that starts `claude -p`,
// reads the store, watches sessions and opens terminals. The second half is
// 27,000 lines of ordinary Node and has never cared what is drawing.
//
// Until now the only way to reach it was Electron's private channel between a
// window and the app, which a browser tab cannot knock on. This is the other
// door: the same `registerIpc` surface, the same 78 channels, reachable at
// http://127.0.0.1:<port> so an ordinary tab can use it.
//
// WHAT THIS IS NOT. It is not hosting and it is not the internet. It binds to
// the loopback address, which is the machine's name for itself, so nothing off
// this computer can reach it. The token below is what stops another PROGRAM on
// the same machine driving somebody's agents: a browser will happily let any
// page make a request to localhost, so the port alone is not a door key.
//
// HOW IT REUSES RATHER THAN REPEATS. `registerIpc` takes its three Electron
// things as an argument, so this file hands it plain Node stand-ins: an
// `ipcMain` that files each handler in a Map instead of wiring it to a window,
// an `app` with the two flags and the quit hook it reads, and a `dialog` that
// says "not here" until the browser folder picker exists. Every channel is then
// answered by the code the desktop app answers with.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { mediaResponse, mediaType, servable } from './img-scheme.mjs';
import { readPictureShape } from './picture-shape.mjs';
import { loadConfig } from './config.mjs';
import { Store } from './store.mjs';
import { Supervisor } from './supervisor.mjs';
import { carryHerBriefsAcross, joinMessageRules, setAsideShippedMessageRules, unifyAgentInstructions } from './instruction-settings.mjs';
import { registerIpc } from './ipc.mjs';
import { reportFromRenderer } from './crash-report.mjs';
import * as workItemsDisk from './store/work-items.mjs';
import { createTeamService, teamStateFile } from './team/index.mjs';
import { loadCloudConfig, supabaseSession, headlessSessionFile } from './team/session.mjs';
import { roomsSetup } from './team/room-setup.mjs';
import { appHome, carryMisplacedMachinery, storeRootEnv } from './store/home.mjs';
import { keepAnswerModesIn } from './answer-modes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(here);

/**
 * The stand-in for Electron's `ipcMain`.
 *
 *  It files handlers rather than wiring them, so the http layer can look one up
 *  by name. `on` and `handle` are the same thing here: Electron's `on` is the
 *  fire-and-forget half, and over http a caller who does not want the answer
 *  can simply ignore it.
 */
export function collectingIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle(channel, fn) { handlers.set(channel, fn); },
    on(channel, fn) { handlers.set(channel, fn); },
    removeHandler(channel) { handlers.delete(channel); },
  };
}

/**
 * The stand-in for the window.
 *
 *  `registerIpc` pushes to the screen through `window.webContents.send`, seven
 *  channels of it. Here each push goes to every open listener instead, which is
 *  what the websocket half will hand to the tab.
 */
export function broadcastingWindow() {
  const listeners = new Set();
  return {
    listeners,
    isDestroyed: () => false,
    webContents: {
      send(channel, ...args) {
        for (const send of listeners) {
          try { send({ channel, args }); } catch { /* a closed tab is not an error */ }
        }
      },
    },
  };
}

/**
 * The stand-in for `app` and `dialog`.
 *
 *  `app` is read for two flags and one quit hook. `isPackaged` is false because
 *  this is being run from a checkout or from npm, never from a signed bundle,
 *  and the screens that read it use it to decide whether to offer to open a
 *  second copy of a packaged app.
 *
 *  `dialog` says there is no dialog, and that is all it says. It does NOT mean
 *  a tab cannot choose a folder: this process reads the disk perfectly well and
 *  `zero:list-folders` walks it, so the screen draws its own picker and comes
 *  back with a real absolute path. `noDialog` is the flag that tells it to.
 *  See main/folders.mjs.
 */
export function nodeHost({ onQuit = () => {}, openExternal = openInBrowser } = {}) {
  const quitHooks = [];
  return {
    ipcMain: collectingIpcMain(),
    shell: { openExternal: async (url) => { openExternal(url); } },
    app: {
      isPackaged: false,
      getVersion: () => readVersion(),
      on(event, fn) { if (event === 'before-quit') quitHooks.push(fn); },
      quit() { for (const fn of quitHooks) { try { fn({ preventDefault() {} }); } catch {} } onQuit(); },
    },
    dialog: {
      showOpenDialog: async () => ({ canceled: true, noDialog: true, filePaths: [] }),
    },
  };
}

function openInBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(cmd, [url], { detached: true, stdio: 'ignore', shell: process.platform === 'win32' }).unref();
  } catch { /* no browser on this machine */ }
}

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * The four channels main/main.mjs registers beside its window, not in ipc.mjs.
 *
 *  Each is about the desktop window itself (the dock badge, a ⌘R, banners in
 *  Notification Center, the window's own crashes), so `registerIpc` never
 *  files them and a tab asking got a 404. That was not harmless: a failed
 *  `badge` became an uncaught error, the screen reported it on `crash`, that
 *  failed too, and the tab sent thousands of requests a second.
 *  tests/a-browser-tab-gets-an-answer-on-every-channel.test.mjs.
 *
 *  A tab has no dock and no ⌘R of ours to report, and nothing here decides
 *  banners yet, so three of them answer with nothing. A crash goes through the
 *  same scrubbed path as the desktop's, which writes nothing until crash
 *  reports are set up for this process.
 */
export function answerWhatOnlyTheWindowAnswered(ipcMain) {
  ipcMain.handle('zero:badge', () => null);
  ipcMain.handle('zero:corner-tag', () => null);
  ipcMain.handle('zero:notify', () => null);
  ipcMain.handle('zero:boot-info', () => ({ reloaded: false, builtAt: null, recovered: null }));
  // A room invite link only ever opens the desktop app.
  ipcMain.handle('zero:take-join', () => null);
  ipcMain.handle('zero:crash', (_e, payload) => { reportFromRenderer(payload ?? {}); return null; });
  // The phone door belongs to the desktop app (main/phone-link.mjs); a tab is told there is none.
  ipcMain.handle('zero:phone-link', () => null);
}

/**
 * Boot the doing half, with no Electron anywhere.
 *
 *  Six lines, and they are the same six `main/main.mjs` runs. `analytics` and
 *  `updater` are left at the defaults `registerIpc` already has for them: one
 *  sends nothing and the other reports that there is nothing to update, which
 *  is the truth for a copy run out of npm.
 */
export async function bootHeadless({ dataDir = repoRoot, appDir = repoRoot, userDir = dataDir, openExternal = openInBrowser } = {}) {
  const config = loadConfig(dataDir);
  // The browser editor uses the same user files as the desktop. Finish the
  // older migrations first so only user content enters the combined file.
  carryHerBriefsAcross(appDir, userDir);
  joinMessageRules(appDir, userDir);
  setAsideShippedMessageRules(appDir, userDir);
  unifyAgentInstructions(appDir, userDir);
  // THE APP'S OWN HOME IS THE STORE ROOT, BEFORE ANYTHING OPENS THE STORE, as
  // main/main.mjs does for the desktop. The ledgers live under the home the
  // store reads from this variable, and every worker is handed `storeRoot` as
  // that same variable. Without this line the two disagreed: the copy wrote its
  // rows wherever an inherited variable pointed (or a dot-folder in $HOME), each worker
  // looked under `storeRoot`, and every store call answered "no work item".
  // tests/an-agent-in-a-browser-copy-can-reach-its-own-work-item.test.mjs.
  // Rows already written under the old home come along, or they would vanish.
  const inheritedHome = appHome();
  Object.assign(process.env, storeRootEnv(config.storeRoot));
  carryMisplacedMachinery(inheritedHome, config.storeRoot);
  keepAnswerModesIn({ userDir, storeRoot: config.storeRoot });
  const store = await new Store(config).init();
  const supervisor = new Supervisor(config, store, appDir, dataDir, userDir);
  const window = broadcastingWindow();
  const host = nodeHost({ openExternal });
  // THE TEAM, as on the desktop (main/main.mjs), with no Electron: the session
  // file is plain JSON readable only by this user, kept in this copy's own
  // folder and not in the store (headlessSessionFile), and Google sign-in opens
  // in the Mac's own browser.
  const cloudConfig = loadCloudConfig(appDir);
  let ipc = null;
  const team = cloudConfig ? createTeamService({
    session: supabaseSession({
      cloudConfig,
      sessionFile: headlessSessionFile({ userDir, storeRoot: config.storeRoot }),
      openExternal: host.shell.openExternal,
    }),
    store,
    disk: workItemsDisk,
    accountRoot: config.accountRoot,
    stateFile: teamStateFile(config.storeRoot),
    onChange: () => ipc?.push?.(),
    rooms: roomsSetup({ config, store, supervisor, userDir }),
  }) : null;
  // AND IT STOPS ITS OWN WORKERS ON THE WAY OUT, as main/main.mjs does for the
  // desktop. Control-C reaches the whole process group, so without this each
  // worker died of the signal itself and was written down as a run that failed
  // on its own: a Claude task stopped that way read "it will keep failing the
  // same way until this is fixed" and rested 15 minutes after the copy came
  // back (tests/control-c-on-the-browser-copy-does-not-fail-its-agents).
  host.app.on('before-quit', () => supervisor.killAll());
  ipc = registerIpc({ store, supervisor, config, window, host, team });
  answerWhatOnlyTheWindowAnswered(host.ipcMain);
  return { config, store, supervisor, window, host, ipc, team, channels: host.ipcMain.handlers };
}

/** A token in the url, because the port alone is not a door key. */
export const newToken = () => crypto.randomBytes(24).toString('base64url');

/**
 * THE PICTURES A TAB MAY DRAW: the desktop window's own rule (`servable`,
 * main/img-scheme.mjs) over its own roots (`imageRoots`, main/main.mjs), so a
 * door opened for a screenshot can never hand out `zero.config.json`.
 *
 * Pictures only. A whole document is served under a grant the pane opens one
 * at a time (main/doc-scheme.mjs) and this copy opens none.
 */
export function picturesTheAppOwns({ config, store }) {
  return {
    allows: (kind, file) => kind === 'img' && servable(file, [
      config?.accountRoot,
      ...(store?.listProducts?.() ?? []).map((p) => p.repoPath),
    ].filter(Boolean)),
  };
}

/**
 * THE KEY THAT ONLY READS FILES. A design page runs its own scripts and can
 * read its own address, so the address a phone loads it from must not carry
 * the phone's key, which starts agents and approves their requests. This is
 * made from that key, changes when it is reset, and opens nothing but /f/.
 */
export const fileKey = (token) => crypto.createHmac('sha256', String(token ?? '')).update('agentbox-files').digest('base64url').slice(0, 32);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

/**
 * One file off this computer, for the phone: /f/<file key>/<doc|img>/<path>.
 * `files.allows(kind, file)` is the same rule the desktop's two schemes use
 * (main/main.mjs passes it in), checked after the path is made whole, so a
 * `..` cannot climb out of what it allows. Never from memory, for the reason
 * the desktop's schemes give: a picture an agent redraws keeps its name.
 */
async function answerFile(req, res, url, { token, files }) {
  const [, , key, kind, ...rest] = url.pathname.split('/');
  if (kind !== 'doc' && kind !== 'img' && kind !== 'shape') { res.writeHead(404).end('No such kind of file.'); return; }
  if (!sameKey(key, fileKey(typeof token === 'function' ? token() : token))) { res.writeHead(403).end('Wrong key.'); return; }
  let file;
  try { file = path.normalize('/' + rest.map(decodeURIComponent).join('/')); } catch { res.writeHead(400).end('Bad path.'); return; }
  // A shape is asked of a picture, under the picture's own rule.
  if (!path.isAbsolute(file) || !files.allows(kind === 'shape' ? 'img' : kind, file)) { res.writeHead(403).end('Not available.'); return; }
  let stat;
  try { stat = await fs.promises.stat(file); } catch { res.writeHead(404).end('Not there.'); return; }
  if (!stat.isFile()) { res.writeHead(404).end('Not there.'); return; }
  // ITS WIDTH AND HEIGHT, so a picture the phone has never seen holds its
  // place before its last byte comes (main/picture-shape.mjs).
  if (kind === 'shape') {
    const shape = await readPictureShape(file).catch(() => null);
    if (!shape) { res.writeHead(404).end('Not a picture this can measure.'); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(shape));
    return;
  }
  const media = mediaType(file);
  if (media) {
    const out = await mediaResponse(file, req.headers.range);
    res.writeHead(out.status, { ...Object.fromEntries(out.headers), 'cache-control': 'no-store' });
    if (out.body) Readable.fromWeb(out.body).pipe(res); else res.end();
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': String(stat.size),
    'cache-control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
}

/**
 * Serve one built renderer and one channel endpoint.
 *
 *  `POST /api/<channel>` with a json body calls the handler `registerIpc` filed
 *  under that name and answers with whatever it returned. That is the whole
 *  request half: 78 channels, one route.
 *
 *  `listeners` is the Set off `broadcastingWindow`, which is where the pushes
 *  going the other way are waiting for somewhere to go.
 */
export function createServer(options) {
  return http.createServer(createHandler(options));
}

/**
 * The same door as a bare request handler, so main/phone-link.mjs can put its
 * own server in front of it. `token` may be a function, read on every request,
 * so a key that is reset stops working at once.
 */
export function createHandler({ channels, token, listeners = new Set(), dist = path.join(repoRoot, 'renderer', 'dist'), files = null }) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    // A file for the phone, behind the file key rather than the phone's own.
    // Only a server that was handed `files` has any to give.
    if (url.pathname.startsWith('/f/')) {
      if (!files) { res.writeHead(404).end('No files here.'); return; }
      await answerFile(req, res, url, { token, files });
      return;
    }

    // The token rides in a header on api calls and in the query on the event
    // stream, because a browser cannot put a header on either a navigation or
    // an EventSource. It guards the two doors that reach the store. The built
    // screen is the same public files for everybody, and its own script and
    // style requests carry no token, so asking for one there drew a blank tab.
    // NOR DOES THE PAGE ITSELF ASK: the tab takes the token out of its address
    // bar on load, so a reload asks for `/` bare, and refusing that drew
    // "Wrong or missing token" on every reload (tests/a-browser-tab-survives-a-reload).
    //
    // AND THE HOST HEADER IS NOT CHECKED, asked and answered 2026-10-24.
    // Refusing a Host that is not localhost is the usual guard against a page
    // whose own name resolves to this machine, and it cannot go here:
    // main/phone-link.mjs serves this same handler to a phone through a relay
    // or over Tailscale, where the Host is neither. The token is the key,
    // whatever name the request arrives under
    // (tests/the-doing-half-runs-with-no-electron).
    const guarded = url.pathname === '/events' || url.pathname.startsWith('/api/') || url.pathname === '/file-key';
    const given = req.headers['x-agentbox-token'] || url.searchParams.get('token');
    if (guarded && !sameKey(given, typeof token === 'function' ? token() : token)) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Wrong or missing token. Use the url the terminal printed.');
      return;
    }

    // The phone asks for its file key once, with its own key.
    if (url.pathname === '/file-key') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ key: fileKey(typeof token === 'function' ? token() : token) }));
      return;
    }

    // The phone line left open. Seven channels talk the other way, main to
    // screen, and every one of them is one-way, so this is an event stream
    // rather than a websocket: the same job with no dependency to add.
    if (url.pathname === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write('retry: 1000\n\n');
      const send = (message) => res.write(`data: ${JSON.stringify(message)}\n\n`);
      listeners.add(send);
      // A proxy or a sleeping laptop will drop a silent connection, and the
      // screen only finds out when a push goes missing. A comment every twenty
      // seconds keeps it honest and costs nothing.
      const beat = setInterval(() => res.write(': beat\n\n'), 20_000);
      req.on('close', () => { clearInterval(beat); listeners.delete(send); });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      const channel = decodeURIComponent(url.pathname.slice('/api/'.length));
      const fn = channels.get(channel);
      if (!fn) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: `No channel named ${channel}` }));
        return;
      }
      let payload;
      try {
        const body = await readBody(req);
        payload = body ? JSON.parse(body) : undefined;
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Body was not json' }));
        return;
      }
      try {
        // The first argument is Electron's event object, which the handlers
        // either ignore or read a sender off. Nothing here has a sender.
        const value = await fn({ sender: null }, payload);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value ?? null));
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(err?.message ?? err) }));
      }
      return;
    }

    // Anything else is the built screen. An unknown path is index.html, because
    // the screen routes itself.
    const rel = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.join(dist, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(dist)) {
      res.writeHead(403).end('No');
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        fs.readFile(path.join(dist, 'index.html'), (err2, index) => {
          if (err2) {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end(`No built screen at ${dist}. Run: npm run build`);
            return;
          }
          res.writeHead(200, { 'content-type': MIME['.html'] });
          res.end(index);
        });
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(buf);
    });
  };
}

/**
 * The key a request carries against the real one, in the same time whatever
 * it gets right, so nobody can learn the key a character at a time by timing
 * the refusals. Both sides are hashed first because a length that differs is
 * itself a thing `timingSafeEqual` would refuse at once.
 */
export function sameKey(given, key) {
  if (typeof given !== 'string' || typeof key !== 'string' || !given || !key) return false;
  const digest = (s) => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(digest(given), digest(key));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      // This is here so a stuck client cannot eat the process. A PHONE'S
      // UPLOADS DO COME THROUGH HERE, though: it has no file paths, so a
      // picture is posted whole, as base64, to zero:stage-attachment. 8 MB of
      // that was a 6 MB photo; an iPhone's is often more (2026-10-12). The
      // relay passes up to 32 MB (relay/worker.mjs).
      if (body.length > 32 * 1024 * 1024) reject(new Error('Body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
