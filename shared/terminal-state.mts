// IS THERE A COMMAND TO STOP, or is this shell just sitting at its prompt.
//
// Both buttons were on the toolbar at all times, side by side, in the same
// weight, and neither said what it acted on. One sends Ctrl+C to whatever is
// running; the other kills the shell and everything under it.
//
// Half the confusion goes away by itself once "Stop" is only on screen when
// there is something to stop, because most of the time she looks at the
// toolbar nothing is running and there is only one button there. The other
// half is the wording, which now names the object: a COMMAND is stopped, a
// SHELL is ended.
//
// IT LIVES IN `shared` BECAUSE BOTH SIDES ASK IT NOW. The toolbar asks to
// decide whether to draw Stop command; the main process asks to decide whether
// a terminal nobody is watching may be ended. Two copies of this rule would
// mean a shell the toolbar calls busy and the reaper calls idle, which is the
// one way this feature can lose somebody's work.
//
// WHAT THE BACKEND GIVES US is node-pty's `pty.process`, the name of the
// foreground process group's leader, read off the tty (main/task-terminals.mts
// line 50). At an idle prompt that is the shell itself, which macOS reports
// with a leading dash for a login shell because the app spawns `$SHELL -l`.
// While `npm test` runs it is `npm`, while `vim` is up it is `vim`.
//
// So "idle" is "the name is a shell's name", and everything else is a command.
// An interactive program whose name happens to be one of these (somebody types
// `bash` inside zsh) reads as idle and hides the Stop button; Ctrl+C in the
// terminal itself still works, which is the route anybody who nests a shell
// already uses.
const SHELLS = /^(zsh|bash|sh|fish|ksh|dash|tcsh|csh|Shell)$/i;

// AND NODE-PTY SAYS THE SAME SHELL THREE DIFFERENT WAYS, WHICH IS WHAT MADE THE
// FIRST VERSION OF THIS SILENTLY WRONG (measured 2026-09-21 against real ttys,
// scripts/evaluate-shell-reaping.mjs). The same idle zsh answered `zsh` on one
// session and `/bin/zsh` on another, and a login shell is `-zsh` because the
// app spawns `$SHELL -l`. Matched whole, `/bin/zsh` is not in the list above,
// so that shell read as BUSY: the Stop command button would sit on an idle
// prompt, and the sweep that ends idle terminals would never end it. The
// feature would have looked shipped and done nothing.
//
// So the name is reduced to what it actually is before it is asked about: no
// directory, no login dash.
function shellName(raw: unknown): string {
  const bare = String(raw).replace(/^-+/, '');
  return (bare.split('/').pop() || bare).replace(/^-+/, '');
}

export function commandRunning(processName: string, exited: boolean): boolean {
  if (exited) return false;
  const name = String(processName || '').trim();
  // NOTHING IS NOT A COMMAND. The backend defaults this to 'Shell' and the
  // component starts it there too, so an empty name should not reach here; if
  // one ever does it means the poll has not answered yet, and a button that
  // appears for a moment on every open and then leaves is worse than one that
  // waits for the first real reading.
  if (!name) return false;
  return !SHELLS.test(shellName(name));
}

// A COMMAND HAS JUST FINISHED: the terminal went from running something back to
// its prompt, or the shell ended under it. Settings' Add account panel reloads
// the accounts on this, because "the account appears above when it is done"
// was a promise nothing kept: the row read "Not signed in" after `claude auth
// login` said "Login successful." (2026-10-05). Feed it every reading the
// terminal polls; it calls `onFinish` once per command, and never for a shell
// that has only ever sat at its prompt.
export function whenACommandFinishes(onFinish: () => void): (processName: string, exited: boolean) => void {
  let running = false;
  return (processName: string, exited: boolean) => {
    const now = commandRunning(processName, exited);
    if (running && !now) onFinish();
    running = now;
  };
}
