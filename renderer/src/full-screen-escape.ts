type FullScreenDoc = { fullscreenElement: unknown; exitFullscreen: () => Promise<void> | void };
type Key = { key: string; stopImmediatePropagation: () => void; preventDefault: () => void };

/** Escape while a film (or anything) is full screen ends full screen and reaches nothing else. */
export function escapeLeavesFullScreen(e: Key, doc: FullScreenDoc): boolean {
  if (e.key !== 'Escape' || !doc.fullscreenElement) return false;
  e.stopImmediatePropagation();
  e.preventDefault();
  void Promise.resolve(doc.exitFullscreen()).catch(() => {});
  return true;
}

/** Installed before the app mounts, so this capture listener runs ahead of every other Escape. */
export function installFullScreenEscape(): void {
  window.addEventListener('keydown', (e) => { escapeLeavesFullScreen(e, document); }, true);
}
