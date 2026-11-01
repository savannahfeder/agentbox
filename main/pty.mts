// THE TERMINAL'S BACKEND, AND WHAT TO SAY WHEN THERE ISN'T ONE.
//
// node-pty ships prebuilt binaries for macOS and Windows only, so every Linux
// install compiles it and a machine with no make and no C++ compiler cannot.
// It is optional for that reason: the install finishes, the app starts, and
// this one pane is what is missing. Every shell opens through here so that the
// missing compiler is said in words somebody can act on.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const NO_TERMINAL = 'There is no terminal in this copy. node-pty, which opens the shell, needs make and a C++ compiler to build. On Debian or Ubuntu run sudo apt install build-essential, then install agentbox again.';

const load = () => require('node-pty');
const find = () => require.resolve('node-pty');

/** node-pty, or a refusal naming what to install. */
export function loadPty(get = load) {
  try {
    return get();
  } catch (err) {
    // Only a missing package is a missing compiler. A binary that will not load
    // is a different problem and keeps its own words.
    if (err?.code === 'MODULE_NOT_FOUND') throw Error(NO_TERMINAL);
    throw err;
  }
}

/** Whether this copy has a terminal at all, for the one line that says so. */
export function ptyIsHere(where = find) {
  try {
    where();
    return true;
  } catch {
    return false;
  }
}
