// PUTS THE PHONE SITE UP (docs/cloud/PHONE-PLAN.md): phone-site/, as
// scripts/build-phone-site.mjs wrote it, on Cloudflare Pages, under the
// project name in team.config.json (`phonePagesProject`, default
// "agentbox-phone"), making the project the first time. Needs
// `npx wrangler login` once on this machine.
//
// After the first deploy, three things are done by hand, once:
//   1. put the address it prints, or a custom domain added to the project, in
//      ~/.agentbox/team.config.json as `phoneSite`;
//   2. add that address to the database's allowed sign-in return addresses
//      (Supabase: Authentication > URL Configuration > Redirect URLs);
//   3. apply cloud/supabase/migrations/20261014000200_phone_inbox.sql.
//
//   npm run phone:deploy
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { teamConfigFile, pagesProjectOf } from './phone-site-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'phone-site');
if (!fs.existsSync(path.join(site, 'index.html'))) throw new Error('build it first: npm run phone:build');
let project = pagesProjectOf(null);
try { project = pagesProjectOf(JSON.parse(fs.readFileSync(teamConfigFile(root), 'utf8'))); } catch { /* the default */ }
if (!/^[a-z0-9-]{1,58}$/.test(project)) throw new Error(`not a Pages project name: ${project}`);
// The first time, the project is made; after that this says it exists, which is fine.
spawnSync('npx', ['--yes', 'wrangler@4', 'pages', 'project', 'create', project, '--production-branch', 'main'], { stdio: 'inherit', cwd: root });
const run = spawnSync('npx', ['--yes', 'wrangler@4', 'pages', 'deploy', site, '--project-name', project, '--branch', 'main', '--commit-dirty=true'], { stdio: 'inherit', cwd: root });
process.exit(run.status ?? 1);
