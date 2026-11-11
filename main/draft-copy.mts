// The app's own copy of the window's drafts (renderer/src/draft-copy.ts).

import fs from 'node:fs';

export function readDraftCopyFile(file: string): string | null {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

/** Written beside and renamed over, so a failed write (a full disk) leaves the last good copy. */
export async function writeDraftCopyFile(file: string, text: string, fsp: typeof fs.promises = fs.promises): Promise<boolean> {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    await fsp.writeFile(tmp, text, 'utf8');
    await fsp.rename(tmp, file);
    return true;
  } catch {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    return false;
  }
}

interface DraftCopyIpc {
  on(channel: string, listener: (event: { returnValue: unknown }, text?: unknown) => void): unknown;
}

export function answerDraftCopy({ ipcMain, file }: { ipcMain: DraftCopyIpc; file: string }): void {
  // Writes go one at a time and only the newest waiting one is kept.
  let writing = false;
  let next: string | null = null;
  const drain = async () => {
    if (writing) return;
    writing = true;
    while (next !== null) {
      const text = next;
      next = null;
      await writeDraftCopyFile(file, text);
    }
    writing = false;
  };
  ipcMain.on('zero:draft-copy-read', (event) => { event.returnValue = readDraftCopyFile(file); });
  ipcMain.on('zero:draft-copy-write', (_event, text) => {
    if (typeof text !== 'string') return;
    next = text;
    void drain();
  });
}
