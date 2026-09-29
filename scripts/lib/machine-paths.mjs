// WHERE THIS MAC KEEPS THINGS, READ AT RUN TIME AND NEVER WRITTEN INTO A SCRIPT.
//
// The open source sweep (ec2a58fc, 2026-09-22) took the founder's home folder
// and account id out of the tree by rewriting every literal to
// `/Users/you/Zero/accounts/00000000-0000-4000-8000-000000000000`. That kept
// her identity out of the code and quietly pointed about 150 measuring and
// screenshot scripts at a folder that exists on nobody's Mac, hers included.
// The scripts now ask here instead: the home folder from the OS, the store root
// and account id from zero.config.json, the same file the app reads.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(repo, 'zero.config.json'), 'utf8')); } catch { return {}; }
}

const config = readConfig();

export const HOME = os.homedir();
export const STORE_ROOT = process.env.ASTRAL_HOME || config.storeRoot || path.join(HOME, 'Zero');
export const ACCOUNT_ID = process.env.STORE_ACCOUNT_ID || config.accountId || '00000000-0000-4000-8000-000000000000';
export const ACCOUNT_ROOT = path.join(STORE_ROOT, 'accounts', ACCOUNT_ID);
// The store's per-product machinery folder is `projects/<product dir, every
// non-alphanumeric character as "-">` (main/store/home.mjs, encodeProjectPath).
// This is that name up to the product slug, so `${MACHINERY_PREFIX}agentbox`.
export const MACHINERY_PREFIX = `${path.join(STORE_ROOT, 'projects')}/${ACCOUNT_ROOT.replace(/[^A-Za-z0-9]/g, '-')}-`;
