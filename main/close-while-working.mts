// Closing the window quits the app (`window-all-closed`), and quitting stops
// the agents the run host does not hold until the app opens again (Codex, for
// one; `_stoppedByQuitting` in main/supervisor.mts counts them). So the close button
// and the menu's Quit (⌘Q, Ctrl+Q) ask first; a quit nobody pressed (an
// update's restart, logging out) arrives as a bare `before-quit` and is not
// asked about.

interface CloseEvent { preventDefault(): void }

interface ClosingWindow {
  on(event: 'close', listener: (event: CloseEvent) => void): unknown;
  close(): void;
  isDestroyed(): boolean;
}

interface QuittingApp {
  on(event: 'before-quit', listener: () => void): unknown;
  quit(): void;
}

interface Asker {
  showMessageBox(window: never, options: {
    type: 'warning';
    message: string;
    detail: string;
    buttons: string[];
    defaultId: number;
    cancelId: number;
  }): Promise<{ response: number }>;
}

/** The question, for `count` agents working here. */
export function closeQuestion(count: number, name: string) {
  const one = count === 1;
  return {
    type: 'warning' as const,
    message: one ? 'An agent is still working' : `${count} agents are still working`,
    detail: `Quitting ${name} stops ${one ? 'it' : 'them'}. ${one ? 'It picks' : 'They pick'} up where ${one ? 'it' : 'they'} left off when you open ${name} again.`,
    buttons: ['Quit', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  };
}

export function askBeforeClosingWhileWorking({ app, window, dialog, working, name }: {
  app: QuittingApp;
  window: ClosingWindow;
  dialog: Asker;
  /** How many agents a quit would stop right now. */
  working: () => number;
  name: string;
}): { quit(): void } {
  let quitting = false;
  let confirmed = false;
  let asking = false;
  app.on('before-quit', () => { quitting = true; });
  const ask = (count: number, then: () => void) => {
    if (asking) return;
    asking = true;
    void dialog.showMessageBox(window as never, closeQuestion(count, name))
      .then(({ response }) => {
        if (response !== 0) return;
        confirmed = true;
        then();
      })
      .catch(() => {})
      .finally(() => { asking = false; });
  };
  window.on('close', (event) => {
    if (quitting || confirmed) return;
    const count = working();
    if (!count) return;
    event.preventDefault();
    ask(count, () => { if (!window.isDestroyed()) window.close(); });
  });
  return {
    quit() {
      const count = confirmed ? 0 : working();
      if (!count) { app.quit(); return; }
      ask(count, () => app.quit());
    },
  };
}
