// Refresh only while the slash menu is being used. A native session can report
// a different skill/plugin list without the user closing the task. Serialize
// reads, and discard late responses when the menu closes or its task changes.
export function watchCommandCatalog(load: () => Promise<string[]>, publish: (names: string[]) => void): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previous: string | undefined;
  const refresh = async () => {
    try {
      const names = await load();
      const signature = JSON.stringify(names);
      if (!stopped && signature !== previous) {
        previous = signature;
        publish(names);
      }
    } catch { /* Keep the last known list; a later read can recover. */ }
    finally { if (!stopped) timer = setTimeout(refresh, 1000); }
  };
  void refresh();
  return () => { stopped = true; clearTimeout(timer); };
}
