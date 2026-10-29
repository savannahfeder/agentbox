// npm run relay:deploy — PUTS THE PHONE RELAY ON CLOUDFLARE, from this folder.
//
// 1. Builds what the relay serves (relay/build.mjs).
// 2. Installs wrangler, at the version relay/package-lock.json pins, if it is
//    not here yet.
// 3. Signs in to Cloudflare if this computer is not signed in: wrangler opens
//    the Cloudflare page in the browser, once, for the person running this.
// 4. Deploys, and writes the address it got to relay/relay.local.json, which
//    the app in this folder reads (main/relay-address.mts). Restart the app,
//    and Settings, then Phone, offers "Anywhere".
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildRelay } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: here, stdio: 'inherit', ...opts });
const wrangler = path.join(here, 'node_modules', '.bin', 'wrangler');

/** The address wrangler printed, or null. */
export function deployedAddress(output) {
  const m = String(output).match(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev\b/i);
  return m ? m[0] : null;
}

async function main() {
  await buildRelay();
  console.log('Built what the relay serves.');

  if (!fs.existsSync(wrangler)) {
    console.log('Installing wrangler for the relay (once)…');
    if (run('npm', ['ci', '--no-audit', '--no-fund']).status !== 0) process.exit(1);
  }

  const who = spawnSync(wrangler, ['whoami'], { cwd: here, encoding: 'utf8' });
  if (who.status !== 0 || /not authenticated|You are not logged in/i.test(`${who.stdout}${who.stderr}`)) {
    console.log('Signing in to Cloudflare. A page opens in your browser; approve it there.');
    if (run(wrangler, ['login']).status !== 0) process.exit(1);
  }

  console.log('Deploying the relay…');
  const out = await new Promise((resolve) => {
    let text = '';
    const child = spawn(wrangler, ['deploy'], { cwd: here, stdio: ['inherit', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { text += d; process.stdout.write(d); });
    child.stderr.on('data', (d) => { text += d; process.stderr.write(d); });
    child.on('close', (code) => resolve({ code, text }));
  });
  if (out.code !== 0) process.exit(out.code ?? 1);

  const url = deployedAddress(out.text);
  if (!url) {
    console.log('Deployed, but its address was not in what wrangler printed. Put it in relay/relay.local.json as {"url": "https://…"}.');
    process.exit(1);
  }
  fs.writeFileSync(path.join(here, 'relay.local.json'), `${JSON.stringify({ url, deployedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`\nThe relay is at ${url}`);
  console.log('Restart Agentbox, then open Settings, then Phone, and pick Anywhere.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
