#!/usr/bin/env node
// THE OWNER'S HAND ON THE CLOUD SERVER, through a direct call to the function
// (never its public address). Needs an admin sign-in (`aws login`).
//
//   node scripts/cloud-gateway-admin.mjs plan <person id> <free|pro|plus|max>
//   node scripts/cloud-gateway-admin.mjs disable <person id>   # stops their runs, refuses their keys
//   node scripts/cloud-gateway-admin.mjs enable <person id>
//   node scripts/cloud-gateway-admin.mjs sign-out <person id>  # ends every cloud key they hold
//   node scripts/cloud-gateway-admin.mjs pause                 # no new runs for anyone
//   node scripts/cloud-gateway-admin.mjs resume
//   node scripts/cloud-gateway-admin.mjs sweep
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const USAGE = 'usage: cloud-gateway-admin.mjs plan <person> <plan> | disable <person> | enable <person> | sign-out <person> | pause | resume | sweep';

/** The event a command line sends to the function. */
export function adminEvent([what, person, plan] = []) {
  if (what === 'sweep') return { sweep: true };
  if (what === 'pause' || what === 'resume') return { admin: { do: what } };
  if ((what === 'disable' || what === 'enable' || what === 'sign-out') && person) return { admin: { do: what, person } };
  if (what === 'plan' && person && plan) return { admin: { do: 'plan', person, plan } };
  throw new Error(USAGE);
}

function main() {
  const event = adminEvent(process.argv.slice(2));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-admin-'));
  const out = path.join(dir, 'answer.json');
  try {
    execFileSync('aws', ['lambda', 'invoke', '--region', 'us-east-1', '--function-name', 'agentbox-gateway', '--cli-binary-format', 'raw-in-base64-out', '--payload', JSON.stringify(event), out], { stdio: ['ignore', 'ignore', 'inherit'] });
    console.log(fs.readFileSync(out, 'utf8'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try { main(); } catch (err) { console.error(`cloud-gateway-admin: ${err.message}`); process.exit(1); }
}
