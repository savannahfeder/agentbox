#!/usr/bin/env node
// npm run accounts               every login, as its engine sees it and as Agentbox holds it
// npm run accounts -- --reset    Agentbox forgets what it holds against every login
// npm run accounts -- --json     the same, with each engine's own words
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, configFile } from '../main/config.mts';
import { readLogins, describeLogins, resetAccounts } from '../main/accounts-command.mts';
import { Name } from '../shared/product-name.mjs';

const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

// loadConfig writes a new config when there is none, which would make a fresh
// checkout's first launch look like an old one.
if (!fs.existsSync(configFile(appDir))) {
  console.error(`${Name} has not run from ${appDir} yet, so there is nothing to read. Run this in the folder the app runs from.`);
  process.exit(1);
}
const config = loadConfig(appDir);

if (args.includes('--reset')) {
  const how = await resetAccounts(config.storeRoot);
  console.log(how === 'taken'
    ? `Done. ${Name} has forgotten what it thought about your logins. The next run on each one shows whether it works.`
    : `Saved. ${Name} is not running, so it forgets them when it next starts.`);
  console.log('');
}

const rows = await readLogins(config);
console.log(args.includes('--json') ? JSON.stringify(rows, null, 2) : describeLogins(rows));
