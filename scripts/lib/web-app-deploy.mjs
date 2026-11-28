// THE WEB APP GOES UP WITH THE SHIP THAT CHANGED IT
// (tests/the-web-app-is-deployed-when-a-ship-changes-it.test.mts).
//
// The live site says which commit it was built from (scripts/build-phone-site.mjs).
// After a push, a ship that changed anything the site is built from since that
// commit builds it and puts it up with `npm run phone:deploy`, on a computer
// that has the site's address and a Cloudflare sign-in. A ship whose deploy did
// not work is still shipped; it says so, with the command that puts it up.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { teamConfigFile, pagesProjectOf } from '../phone-site-config.mjs';
import { runSandboxed } from './branch-sandbox.mjs';

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

/**
 * The shipped commit, checked out afresh, with the app folder's packages. The
 * branch's tests ran in `root` and could write anything there, node_modules
 * aside, and the deploy runs with the person's Cloudflare sign-in and outside
 * any sandbox. Packages come from `trusted` when its lockfile is the same, and
 * from a fresh install of the shipped lockfile when not.
 */
export function cleanCopy({ root, sha, trusted, into, env = process.env, sandboxed = runSandboxed }) {
  const copy = path.join(into, 'app');
  execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', root, copy], { stdio: 'ignore' });
  execFileSync('git', ['-C', copy, 'checkout', '--quiet', '--detach', sha], { stdio: 'ignore' });
  const lockOf = (dir) => { try { return fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'); } catch { return null; } };
  const packages = trusted && path.resolve(trusted) !== path.resolve(root) ? path.join(trusted, 'node_modules') : null;
  if (packages && fs.existsSync(packages) && lockOf(trusted) === lockOf(copy)) {
    execFileSync('cp', [process.platform === 'darwin' ? '-cR' : '-R', packages, path.join(copy, 'node_modules')]);
  } else {
    // The shipped lockfile is the branch's, so it installs as the push hook does.
    for (const [stage, args] of [['download', ['ci', '--no-audit', '--no-fund', '--ignore-scripts']], ['build', ['rebuild']]]) {
      const status = sandboxed('npm', args, { cwd: copy, env, stage });
      if (status !== 0) throw new Error(`npm ${args[0]} ended with ${status}`);
    }
  }
  return copy;
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

/** The team settings that name the phone site: `dir`'s own, else the home folder's. */
export function personsSettings(dir, home = os.homedir()) {
  const own = readJson(path.join(dir, 'cloud', 'team.config.json'));
  if (own?.phoneSite) return own;
  const file = teamConfigFile(path.join(home, '.no-checkout-here'), home);
  return (file && readJson(file)) ?? own;
}

/** The same, with this checkout's git, the network and npm, done by `until`. */
export function deployAfterShip({ root, say, until, trusted, sandboxed = runSandboxed }) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  // npm and npx run the branch's own code. The push token and the git settings
  // that hand it over are for git alone.
  const branchEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  let site = null;
  // A task folder's team.config.json is ignored by git, so its tests could write
  // one; a real ship names the app folder, and its file or the home folder's is read.
  const settings = personsSettings(trusted ?? root);
  site = settings?.phoneSite ?? null;
  return deployWebApp({
    site,
    head: () => git('rev-parse', 'HEAD'),
    mainTip: () => { git('fetch', 'origin', '--quiet'); return git('rev-parse', 'refs/remotes/origin/main'); },
    fetchPage: async (url) => (await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'Mozilla/5.0' } })).text(),
    changedSince: (from) => git('diff', '--name-only', `${from}..HEAD`).split('\n').filter(Boolean),
    known: (sha) => spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: root }).status === 0,
    deploy: () => {
      if (until - Date.now() < DEPLOY_NEEDS_MS) return { ok: false, why: 'the ship ran long, so there was no time left to build it' };
      const into = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-deploy-'));
      try {
        let copy;
        try { copy = cleanCopy({ root, sha: git('rev-parse', 'HEAD'), trusted, into, env: branchEnv, sandboxed }); } catch (err) { return { ok: false, why: `a clean copy to build it from could not be made (${err?.message ?? err})` }; }
        // The shipped commit is a worker's branch, so it builds where the push
        // hook ran its tests; only the upload, this file's own, has the sign-in.
        const built = sandboxed('npm', ['run', 'phone:build'], { cwd: copy, env: branchEnv, timeout: Math.max(60_000, until - Date.now()) });
        const site = path.join(copy, 'phone-site');
        if (built !== 0 || !fs.existsSync(path.join(site, 'index.html'))) return { ok: false, why: `the web app did not build (npm run phone:build ended with ${built})` };
        const project = pagesProjectOf(settings);
        if (!/^[a-z0-9-]{1,58}$/.test(project)) return { ok: false, why: `not a Pages project name: ${project}` };
        // From a folder with no node_modules, so npx fetches wrangler rather than run one the branch installed.
        const away = fs.mkdtempSync(path.join(into, 'upload-'));
        const wrangler = (args, opts = {}) => spawnSync('npx', ['--yes', 'wrangler@4', ...args], { cwd: away, env: branchEnv, encoding: 'utf8', ...opts });
        const signedIn = wrangler(['whoami'], { timeout: 120_000 });
        if (signedIn.status !== 0 || /not authenticated|You are not logged in/i.test(`${signedIn.stdout}${signedIn.stderr}`)) {
          return { ok: false, why: 'this computer is not signed in to Cloudflare (npx wrangler login)' };
        }
        const made = wrangler(['pages', 'project', 'create', project, '--production-branch', 'main'], { timeout: 120_000 });
        const r = wrangler(['pages', 'deploy', site, '--project-name', project, '--branch', 'main', '--commit-dirty=true'], { stdio: 'inherit', timeout: Math.max(60_000, until - Date.now()) });
        if (r.status !== 0) say(`${made.stdout ?? ''}${made.stderr ?? ''}`.trim());
        return r.status === 0 ? { ok: true } : { ok: false, why: r.error?.message ?? `wrangler pages deploy ended with ${r.status}` };
      } finally {
        fs.rmSync(into, { recursive: true, force: true });
      }
    },
    log: say,
  });
}
