// A HOT-RELOADING WINDOW MUST NOT BE THE ONE THE USER WORKS IN.
//
// A window an agent starts against a vite dev server can end up running on the
// real store. Vite rebuilds that window whenever the source under it changes,
// and the source under it is the checkout every agent shares, which can be
// checked out or merged several times in a few minutes.
//
// The change that hurts is one to App.tsx that adds, removes or moves a
// hook, which is what a branch switch does to it. React Fast Refresh keeps a
// component's state only while its hooks match, so App is rebuilt from nothing:
// `snap` is null again, App.tsx draws `<div className="boot">the app</div>`, and
// every child of App is thrown away and remade. The window drops back to the
// loading page, and an open artifact closes and reopens. The
// page never navigates, which is why nothing in the dev server's log looked bad
// enough to be it. Six triggers were measured against a real window and exactly
// one was guilty: scripts/what-throws-her-out-of-agentbox.mjs.
//
// THE GUARD IS HERE RATHER THAN IN scripts/dev.mjs BECAUSE THAT IS NOT HOW IT
// HAPPENED. The dev server that day was started by hand, straight out of a
// scratchpad, and the app was started beside it with the environment variable
// set. A guard in the npm script would have watched it go past. Every dev window
// there can ever be goes through main.mjs asking for this verdict, so this is
// the only place that actually closes the door.
//
// WHAT IS STILL ALLOWED, because a guard that stops the work is a guard somebody
// deletes:
//
//   Fixtures. Nothing in a fixtures window is real, so there is nothing to be
//   thrown out of, and this is what screenshot and proof scripts use.
//
//   A throwaway store. A script that points HOME at a temp directory has no
//   accounts under its store root, and a window on an empty store is nobody's
//   working day.
//
//   Saying you meant it, with ZERO_DEV_ON_REAL_STORE=1.

// `storeHasWork` is passed in rather than read here so this stays a pure
// decision and can be tested without a disk.
export function hotWindowVerdict({ devUrl, fixtures, forced, storeRoot, storeHasWork }) {
  if (!devUrl) return { allow: true, reason: 'no dev server' };
  if (fixtures) return { allow: true, reason: 'fixtures' };
  if (forced) return { allow: true, reason: 'ZERO_DEV_ON_REAL_STORE' };
  if (!storeHasWork) return { allow: true, reason: 'no accounts under the store root' };
  return {
    allow: false,
    reason: 'a hot-reloading window on the real store',
    message: [
      '',
      `  ZERO_DEV_URL is set and the store is ${storeRoot}, which is the real one.`,
      '  A window served by a dev server is rebuilt whenever any agent changes the',
      '  source under it, and being thrown back to the boot screen mid-task is what',
      '  w-435356146a was about. Not opening one.',
      '',
      '  For development:            ZERO_FIXTURES=1',
      '  To give her a real window:  npm start, with ZERO_DEV_URL unset',
      '  If you truly meant this:    ZERO_DEV_ON_REAL_STORE=1',
      '',
    ].join('\n'),
  };
}

// Whether a store root has anybody's work under it. An account directory is the
// smallest true sign: a throwaway home has none, hers has one.
export function storeHasWork(fs, path, storeRoot) {
  try {
    const accounts = path.join(storeRoot, 'accounts');
    return fs.readdirSync(accounts).some((name) => !name.startsWith('.'));
  } catch {
    // No store root, no accounts directory, no permission: all of them mean
    // there is no working day here to interrupt.
    return false;
  }
}

// A DEV SERVER MUST NEVER INHERIT A WINDOW IT DID NOT OPEN.
//
// Second half of the same bug, found 2026-08-23 16:00 while getting her out of
// it. Killing the dev server under her window does not navigate it: vite's
// client logs "server connection lost, polling for restart" and then polls
// `${devUrl}` once a second forever, and it only calls `location.reload` once
// one of those pings SUCCEEDS
// (node_modules/vite/dist/client/client.mjs:560-562, waitForSuccessfulPing at
// :732). So her window survived intact with the server gone, but it was left
// waiting on port 5199 like a trap: the next `npm run dev` anybody ran would
// bind that port, her poll would succeed, and she would be thrown straight back
// into the boot screen and back onto the treadmill.
//
// A fixed port is what makes that possible, so dev servers stop using one. Each
// run takes a free ephemeral port and tells its own electron where to find it.
// A window polling yesterday's port then polls it forever and nothing answers,
// which is the whole point.
export function chooseDevPort(net) {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    // Port 0 asks the OS for one nothing else holds, so this can never pick a
    // port some other window is already waiting on.
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}
