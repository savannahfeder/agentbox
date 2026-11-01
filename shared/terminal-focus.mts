// Whether a terminal takes the keyboard when TaskTerminal builds it. Opening
// it, showing it again, Retry and New session do. Coming back to a thread that
// left its terminal open does not: xterm's input is a textarea, and the app's
// shortcuts stand aside for a textarea. `startOpen` is a page that is only a
// terminal, which always takes it.
// Pinned by tests/coming-back-to-an-open-terminal-leaves-the-keyboard-alone.test.mjs.
export function terminalKeys({ startOpen = false, wasOpen = false } = {}) {
  let cameBack = wasOpen === true && !startOpen;
  return {
    takesKeys: (revision = 0) => !cameBack || revision > 0,
    hidden: () => { cameBack = false; },
  };
}
