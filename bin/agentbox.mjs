#!/usr/bin/env node
// THE COMMAND. `npx agentbox-app`, and the app is in a browser tab.
//
// There is no download, no installer and nothing hosted. This starts the doing
// half on this machine, binds it to 127.0.0.1, which is the machine's name for
// itself and is not reachable from anywhere else, and opens a tab at it.
//
// The url carries a token that is new every time this runs. That is not about
// the internet, which cannot see this port at all. It is that a browser will
// let ANY page you have open make a request to localhost, so without a secret
// in the url, a web page could quietly drive somebody's agents.

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { bootHeadless, createServer, newToken } from '../main/serve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.dirname(here);

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  agentbox, in a browser tab.

    npx agentbox-app                 start it and open a tab
    npx agentbox-app --port 7777     ask for a particular port
    npx agentbox-app --dir ~/work    keep the store somewhere else
    npx agentbox-app --no-open       start it and print the url instead

  Everything stays on this machine. Nothing is uploaded and nothing is hosted.
`);
  process.exit(0);
}

// WHERE THE STORE LIVES. A copy run out of npm has no folder of its own to
// write into, and writing inside node_modules would be thrown away by the next
// install. `~/.agentbox` is the plain answer and `--dir` is the escape hatch.
const dataDir = path.resolve(
  flag('dir', process.env.AGENTBOX_HOME ?? path.join(os.homedir(), '.agentbox')),
);
fs.mkdirSync(dataDir, { recursive: true });

const dist = path.join(appDir, 'renderer', 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error(`No built screen at ${dist}.\nFrom a checkout, run: npm run build`);
  process.exit(1);
}

const booted = await bootHeadless({ dataDir, appDir, userDir: dataDir });
const token = newToken();
const server = createServer({
  channels: booted.channels,
  token,
  listeners: booted.window.listeners,
  dist,
});

const wanted = Number(flag('port', 0)) || 0;
server.listen(wanted, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/?token=${token}`;
  console.log(`\n  agentbox is running.\n\n  ${url}\n\n  Store: ${dataDir}\n  Stop it with control-C.\n`);
  if (!args.includes('--no-open')) open(url);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${wanted} is already taken. Leave --port off and one will be picked.`);
    process.exit(1);
  }
  throw err;
});

// Control-C has to reach the agents, not just this process, or a worker carries
// on writing to a store nothing is watching.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n  Stopping.');
    booted.host.app.quit();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

function open(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  try {
    spawn(cmd, [url], { detached: true, stdio: 'ignore', shell: process.platform === 'win32' }).unref();
  } catch {
    // A machine with no browser to open is a normal way to run this. The url is
    // already printed above, which is all anybody needs.
  }
}
