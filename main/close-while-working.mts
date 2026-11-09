// Closing the window quits the app (`window-all-closed`), and quitting stops
// every agent on this computer until the app opens again. A quit asked for by
// name (the menu, ⌘Q, an update's restart) is taken as meant; only the window's
// close button asks first.

interface CloseEvent { preventDefault(): void }

interface ClosingWindow {
  on(event: 'close', listener: (event: CloseEvent) => void): unknown;
  close(): void;
  isDestroyed(): boolean;
}

interface QuittingApp {
  on(event: 'before-quit', listener: () => void): unknown;
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
  /** How many agents are running on this computer right now. */
  working: () => number;
  name: string;
}): void {
  let quitting = false;
  let confirmed = false;
  let asking = false;
  app.on('before-quit', () => { quitting = true; });
  window.on('close', (event) => {
    if (quitting || confirmed) return;
    const count = working();
    if (!count) return;
    event.preventDefault();
    if (asking) return;
    asking = true;
    void dialog.showMessageBox(window as never, closeQuestion(count, name))
      .then(({ response }) => {
        if (response !== 0 || window.isDestroyed()) return;
        confirmed = true;
        window.close();
      })
      .catch(() => {})
      .finally(() => { asking = false; });
  });
}
