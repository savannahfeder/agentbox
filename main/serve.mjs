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
import { loadConfig } from './config.mjs';
import { Store } from './store.mjs';
import { Supervisor } from './supervisor.mjs';
import { registerIpc } from './ipc.mjs';
import * as workItemsDisk from './store/work-items.mjs';
import { createTeamService, teamStateFile } from './team/index.mjs';
import { loadCloudConfig, supabaseSession, headlessSessionFile } from './team/session.mjs';
import { appHome, carryMisplacedMachinery, storeRootEnv } from './store/home.mjs';

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
export function nodeHost({ onQuit = () => {} } = {}) {
  const quitHooks = [];
  return {
    ipcMain: collectingIpcMain(),
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

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Boot the doing half, with no Electron anywhere.
 *
 *  Six lines, and they are the same six `main/main.mjs` runs. `analytics` and
 *  `updater` are left at the defaults `registerIpc` already has for them: one
 *  sends nothing and the other reports that there is nothing to update, which
 *  is the truth for a copy run out of npm.
 */
export async function bootHeadless({ dataDir = repoRoot, appDir = repoRoot, userDir = dataDir } = {}) {
  const config = loadConfig(dataDir);
  // THE APP'S OWN HOME IS THE STORE ROOT, BEFORE ANYTHING OPENS THE STORE, as
  // main/main.mjs does for the desktop. The ledgers live under the home the
  // store reads from this variable, and every worker is handed `storeRoot` as
  // that same variable. Without this line the two disagreed: the copy wrote its
  // rows wherever an inherited variable pointed (or `~/.agentbox`), each worker
  // looked under `storeRoot`, and every store call answered "no work item".
  // tests/an-agent-in-a-browser-copy-can-reach-its-own-work-item.test.mjs.
  // Rows already written under the old home come along, or they would vanish.
  const inheritedHome = appHome();
  Object.assign(process.env, storeRootEnv(config.storeRoot));
  carryMisplacedMachinery(inheritedHome, config.storeRoot);
  const store = await new Store(config).init();
  const supervisor = new Supervisor(config, store, appDir, dataDir, userDir);
  const window = broadcastingWindow();
  const host = nodeHost();
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
      openExternal: async (url) => { spawn('open', [url], { stdio: 'ignore', detached: true }).unref(); },
    }),
    store,
    disk: workItemsDisk,
    accountRoot: config.accountRoot,
    stateFile: teamStateFile(config.storeRoot),
    onChange: () => ipc?.push?.(),
  }) : null;
  ipc = registerIpc({ store, supervisor, config, window, host, team });
  return { config, store, supervisor, window, host, ipc, team, channels: host.ipcMain.handlers };
}

/** A token in the url, because the port alone is not a door key. */
export const newToken = () => crypto.randomBytes(24).toString('base64url');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

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
export function createServer({ channels, token, listeners = new Set(), dist = path.join(repoRoot, 'renderer', 'dist') }) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    // The token rides in a header on api calls and in the query on the event
    // stream, because a browser cannot put a header on either a navigation or
    // an EventSource. It guards the two doors that reach the store. The built
    // screen is the same public files for everybody, and its own script and
    // style requests carry no token, so asking for one there drew a blank tab.
    const guarded = url.pathname === '/events' || url.pathname.startsWith('/api/');
    const given = req.headers['x-agentbox-token'] || url.searchParams.get('token');
    if (guarded && given !== token) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Wrong or missing token. Use the url the terminal printed.');
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
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      // A screen never posts anything large; the uploads go through their own
      // channels. This is here so a stuck client cannot eat the process.
      if (body.length > 8 * 1024 * 1024) reject(new Error('Body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
