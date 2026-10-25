// WHAT `npm run fresh` OPENS, AND WHY IT IS NOT ALWAYS A MAC BUNDLE.
//
// This looked for `Astral.app` and nothing else, so on Linux the command
// answered "No packaged Agentbox found... Looked in /Applications, ~/Applications
// and release/" and stopped (QA, 2026-10-23). There is no bundle to find on
// Linux: the app is run from the checkout there, and the ⌘K row "Open Agentbox
// as a new user" has always been able to do that, because `relaunchCommand` in
// `main/fresh-user.mjs` hands the app directory back to Electron when the copy
// it is relaunching is not packaged.
//
// So the terminal gets the same two ways in, in the same order: a PACKAGED
// bundle when there is one, because that is the app somebody downloads, and
// this CHECKOUT through Electron when there is not.
//
// THE CHECKOUT GOES THROUGH ELECTRON'S OWN cli.js, not through
// `node_modules/electron/dist/electron`. Electron 43 downloads that binary on
// the first run rather than at install time, so the path is often not there
// yet; the cli is what fetches it (`scripts/linux-launcher.mjs` writes the
// launcher the same way, for the same reason).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// The binary inside a bundle is named after the bundle, so a side build packed
// by scripts/pack-side.mjs has "Agentbox Rest" in there and not "Agentbox".
// Read it rather than assume it: without this, ASTRAL_APP pointed at a side
// build answers "no packaged Agentbox found", which is a confusing thing to be
// told about a folder you are looking straight at.
function binIn(app) {
  const dir = path.join(app, 'Contents', 'MacOS');
  try {
    const named = fs.readdirSync(dir).find((f) => f.startsWith('Agentbox'));
    return named ? path.join(dir, named) : null;
  } catch {
    return null;
  }
}

// When the bundle was packed. The asar is the whole app including the renderer,
// so its mtime is the honest answer; the .app directory's own mtime moves for
// reasons that are not a rebuild.
function builtAt(app) {
  try {
    return fs.statSync(path.join(app, 'Contents', 'Resources', 'app.asar')).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * NEWEST WINS, not first found, and that is deliberate. On 2026-08-20 the
 *  signed build in release/ was packed at 15:08 and main moved at 15:20, so a
 *  fresh-user run against it showed a screen twelve minutes out of date. A test
 *  that quietly runs yesterday's app is worse than no test, so the freshest
 *  bundle wins and its age is printed either way. ASTRAL_APP=/path/to/Astral.app
 *  overrides, for when the older one is the point (checking a signed build). */
export function findPackagedApp({ repo, env = process.env, home = os.homedir() } = {}) {
  if (env.ASTRAL_APP) {
    const app = env.ASTRAL_APP;
    const bin = binIn(app);
    return bin ? { app, bin, at: builtAt(app) } : null;
  }
  const candidates = [
    '/Applications/Astral.app',
    path.join(home, 'Applications', 'Astral.app'),
    // electron-builder names this folder after the arch it was asked for, so
    // the build target moving from arm64 to universal moved it. Both are
    // listed because a build packed before that change is still a perfectly
    // good app to open, and the sort below picks the newer one.
    path.join(repo, 'release', 'mac-universal', 'Astral.app'),
    path.join(repo, 'release', 'mac-arm64', 'Astral.app'),
    path.join(repo, 'release', 'mac', 'Astral.app'),
    // Where a session leaves an unsigned build packed straight off main, when
    // the signed one beside it has fallen behind. `npm run release` never
    // writes here, so nothing it produces is ever overwritten by a rebuild.
    path.join(repo, 'release', 'from-main', 'Astral.app'),
  ];
  const found = candidates
    .map((app) => ({ app, bin: path.join(app, 'Contents', 'MacOS', 'Agentbox') }))
    .filter((c) => fs.existsSync(c.bin))
    .map((c) => ({ ...c, at: builtAt(c.app) }))
    .sort((a, b) => b.at - a.at);
  return found[0] ?? null;
}

/** Electron's own cli, resolved from the checkout rather than guessed at. */
export function electronCliIn(repo) {
  try {
    const cli = createRequire(path.join(repo, 'package.json')).resolve('electron/cli.js');
    return fs.existsSync(cli) ? cli : null;
  } catch {
    return null;
  }
}

/**
 * What to run and what to hand it.
 *
 *  `{ kind: 'app' }` is a packaged bundle, which is what somebody downloads.
 *  `{ kind: 'checkout' }` is this repository through Electron, which is the
 *  only way in on Linux and a fair one on a Mac with nothing packed yet;
 *  `needsBuild` says the screen has not been built, because an Electron that
 *  opens on no renderer is a window with nothing in it.
 *  `{ kind: 'none' }` carries the reason, and it names both ways in. */
export function freshUserTarget({ repo, env = process.env, home = os.homedir(), node = process.execPath } = {}) {
  const packaged = findPackagedApp({ repo, env, home });
  if (packaged) return { kind: 'app', bin: packaged.bin, args: [], app: packaged.app, at: packaged.at };
  const cli = electronCliIn(repo);
  if (cli) {
    return {
      kind: 'checkout',
      bin: node,
      args: [cli, repo],
      app: repo,
      needsBuild: !fs.existsSync(path.join(repo, 'renderer', 'dist', 'index.html')),
    };
  }
  return {
    kind: 'none',
    why: 'there is no packaged Agentbox (looked in /Applications, ~/Applications and release/) and no Electron in this checkout. Run `npm install` here, or build one with `npm run pack`.',
  };
}
