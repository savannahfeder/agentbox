// A CODEX WORKER WHOSE APP-SERVER IS IN THE CLOUD (docs/cloud/PLAN.md).
//
// On the Mac a Codex worker ends when its turn ends, and the folder already
// holds its work. A cloud worker's turn ends in the sandbox, and its work
// reaches the folder only after the proxy (main/cloud/run-cli.mjs) has
// stopped the remote app-server, collected and imported. Everything that
// reads the folder on exit (the change card, the ship queue, the next run)
// must wait for that, so the worker's `exit` is held here until the proxy
// process itself has exited (Codex's review, 2026-10-13, finding 1):
//
//   - the turn's own ending is kept, and the moment it happens the worker's
//     input closes, its cards close (`onTurnEnd`), and the connection is
//     closed, which stops the proxy and starts the homecoming;
//   - a reply that arrives in that gap is refused as TURN_CLOSED, which is
//     the contract main/live-replies.mjs already has for "too late for this
//     turn": it is saved as an ordinary reply and carried by the next run;
//   - when the proxy exits, the held ending goes out, unless the proxy said
//     the work could not be brought home (75), or the account's cloud sign-in
//     was missing, refused or ran out (77), each of which goes out as a
//     transport fault: not a delivered reply, not an attempt spent.
import { TURN_CLOSED } from '../claude-input.mjs';

export const IMPORT_FAILED = 75;
export const LOGIN_TROUBLE = 77;

export function holdUntilHome({ worker, client, procExit, onTurnEnd = () => {} }) {
  const realEmit = worker.emit.bind(worker);
  let held = null;
  worker.emit = (event, ...args) => {
    if (event !== 'exit') return realEmit(event, ...args);
    if (held) return true;
    held = args; // [code, signal, how]
    worker.steer = () => {
      const err = new Error('The turn has ended; this reply will start the next one.');
      err.code = TURN_CLOSED;
      return Promise.reject(err);
    };
    try { onTurnEnd(); } catch { /* cards already gone */ }
    try { client.close('the cloud run finished its turn'); } catch { /* already closed */ }
    // A proxy that exits with a code finished: the code is the remote's, or
    // 75 for work it could not bring home. One that was killed, or exited with
    // no code at all, never said, so the work is not known to be home.
    const notHome = (extra = {}) => realEmit('exit', IMPORT_FAILED, null, { ...(held[2] || {}), transportFault: true, ...extra });
    Promise.resolve(procExit).then((out) => {
      const code = out?.code;
      if (code === LOGIN_TROUBLE) notHome({ cloudLoginTrouble: true });
      else if (code === IMPORT_FAILED || !Number.isInteger(code) || out?.signal) notHome();
      else realEmit('exit', ...held);
    }, notHome);
    return true;
  };
  return worker;
}
