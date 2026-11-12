// THE WEB APP GOES UP WITH THE SHIP THAT CHANGED IT
// (tests/the-web-app-is-deployed-when-a-ship-changes-it.test.mts).
//
// The live site says which commit it was built from (scripts/build-phone-site.mjs).
// After a push, a ship that changed anything the site is built from since that
// commit builds it and puts it up with `npm run phone:deploy`, on a computer
// that has the site's address and a Cloudflare sign-in. A ship whose deploy did
// not work is still shipped; it says so, with the command that puts it up.
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { teamConfigFile } from '../phone-site-config.mjs';

export const SITE_PATHS = ['renderer/', 'shared/', 'phone-legal/', 'scripts/build-phone-site.mjs', 'cloud/web/', 'main/phone-icon.png'];

export const siteChanged = (files) => (files ?? []).some((f) => SITE_PATHS.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p)));

export function liveBuildOf(html) {
  return /<meta name="agentbox-build" content="([0-9a-f]{40})[\s"]/.exec(String(html ?? ''))?.[1] ?? null;
}

export async function deployWebApp({ site, head, mainTip, fetchPage, changedSince, known, deploy, log }) {
  if (!site) {
    log('the web app was not updated: this computer has no phoneSite in team.config.json.');
    return { deployed: false };
  }
  const now = head();
  let live = null;
  try { live = liveBuildOf(await fetchPage(site)); } catch (err) { log(`could not read which build of the web app is live (${err?.message ?? err}).`); }
  if (live === now) return { deployed: false };
  if (live && known(live) && !siteChanged(changedSince(live))) return { deployed: false };
  // Built and put up after a newer ship, this one would take the site back.
  if (mainTip() !== now) {
    log('the web app is left to the newer ship: main moved past this one.');
    return { deployed: false };
  }
  log('the web app changed with this ship. Building it and putting it up.');
  const out = deploy();
  if (!out.ok) {
    log(`the web app was not updated: ${out.why}. Put it up with: npm run phone:deploy`);
    return { deployed: false };
  }
  log(`web app updated to ${now.slice(0, 7)} at ${site}.`);
  return { deployed: true };
}

// A build and an upload take a few minutes; with less than this left before
// `until`, the ship queue (main/ship-queue.mts, 20 minutes) would cut it off.
export const DEPLOY_NEEDS_MS = 6 * 60_000;

/** The same, with this checkout's git, the network and npm, done by `until`. */
export function deployAfterShip({ root, say, until }) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  let site = null;
  try { site = JSON.parse(fs.readFileSync(teamConfigFile(root), 'utf8')).phoneSite ?? null; } catch { /* none here */ }
  return deployWebApp({
    site,
    head: () => git('rev-parse', 'HEAD'),
    mainTip: () => { git('fetch', 'origin', '--quiet'); return git('rev-parse', 'refs/remotes/origin/main'); },
    fetchPage: async (url) => (await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'Mozilla/5.0' } })).text(),
    changedSince: (from) => git('diff', '--name-only', `${from}..HEAD`).split('\n').filter(Boolean),
    known: (sha) => spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: root }).status === 0,
    deploy: () => {
      if (until - Date.now() < DEPLOY_NEEDS_MS) return { ok: false, why: 'the ship ran long, so there was no time left to build it' };
      const signedIn = spawnSync('npx', ['--yes', 'wrangler@4', 'whoami'], { cwd: root, encoding: 'utf8', timeout: 120_000 });
      if (signedIn.status !== 0 || /not authenticated|You are not logged in/i.test(`${signedIn.stdout}${signedIn.stderr}`)) {
        return { ok: false, why: 'this computer is not signed in to Cloudflare (npx wrangler login)' };
      }
      const r = spawnSync('npm', ['run', 'phone:deploy'], { cwd: root, stdio: 'inherit', timeout: Math.max(60_000, until - Date.now()) });
      return r.status === 0 ? { ok: true } : { ok: false, why: r.error?.message ?? `npm run phone:deploy ended with ${r.status}` };
    },
    log: say,
  });
}
