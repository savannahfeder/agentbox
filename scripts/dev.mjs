// Dev: vite serves the renderer with HMR, electron points at it.
//
// THIS IS A DEVELOPMENT TOOL AND IT MUST NOT BECOME THE USER'S EVERYDAY APP.
//
// An agent can start a window this way on the real store, and the user can end
// up working in it all day. A window served by vite is rebuilt whenever the
// source under it changes, and the source under it is the checkout every agent
// shares, which can be checked out or merged several times in a few minutes.
//
// The change that hurts is one to App.tsx that adds, removes or moves a
// hook, which every branch switch does. React Fast Refresh keeps a component's
// state only while its hooks match, so App is rebuilt from nothing: `snap` is
// null again, App.tsx draws `<div className="boot">the app</div>`, and every child
// of App is thrown away and remade. That is the "zero loading page" and that is
// the artifact closing and reopening. It is not a page reload, which is why
// nothing in the dev server's log looked bad enough to be it. Measured against a
// real window, six triggers, one guilty:
// scripts/what-throws-her-out-of-agentbox.mjs.
//
// So this refuses to put a hot-reloading window on the real store. Fixtures are
// free (nothing there is real to lose), and the door is still open with
// ZERO_DEV_ON_REAL_STORE=1 for the times somebody genuinely needs it. To give
// the user a window, use `npm start`, which builds once and then serves nothing:
// no dev server exists to push a rebuild into it, so nothing an agent does to
// the checkout can reach the window they are working in.
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../main/config.mjs';
import { chooseDevPort } from '../main/dev-window.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => path.join(root, 'node_modules', '.bin', name);

const onFixtures = !!process.env.ZERO_FIXTURES;
const forced = process.env.ZERO_DEV_ON_REAL_STORE === '1';
if (!onFixtures && !forced) {
  const { storeRoot } = loadConfig(root);
  console.error([
    '',
    `  npm run dev would put a hot-reloading window on ${storeRoot},`,
    '  which is the real store. A window served this way is rebuilt whenever any',
    '  agent changes the source under it, and being thrown back to the boot screen',
    '  mid-task is what w-435356146a was about.',
    '',
    '  For development:            ZERO_FIXTURES=1 npm run dev',
    '  To give her a real window:  npm start',
    '  If you truly meant this:    ZERO_DEV_ON_REAL_STORE=1 npm run dev',
    '',
  ].join('\n'));
  process.exit(1);
}

// A free port rather than a fixed one, so this run can never bind the port some
// older window is still polling and yank it back. See chooseDevPort.
const port = await chooseDevPort(net);
const devUrl = `http://localhost:${port}`;
console.log(`  dev server on ${devUrl}`);

const vite = spawn(bin('vite'), ['renderer', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'inherit' });

setTimeout(() => {
  const electron = spawn(bin('electron'), ['.'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ZERO_DEV_URL: devUrl },
  });
  electron.on('exit', () => vite.kill());
}, 1200);

vite.on('exit', () => process.exit());
