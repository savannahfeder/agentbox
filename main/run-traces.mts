// The logs a thread's runs wrote, one per run, under sessions/<item-id>/.
import fs from 'node:fs';
import path from 'node:path';

// The regular read runs on every push while an agent works, so it stays small.
// `whole` is the read for a thread whose middle was asked for, and it is made once.
const NEWEST = 20;
const TAIL = 120_000;

const logsIn = (dir: string): string[] => {
  try { return fs.readdirSync(dir).filter((f) => f.endsWith('.log')).sort(); } catch { return []; }
};
const startOf = (f: string) => Number(f.replace('.log', '')) || 0;

export function readRunTraces(dir: string, { whole = false }: { whole?: boolean } = {}): { startedAt: number; text: string }[] {
  const files = logsIn(dir);
  return (whole ? files : files.slice(-NEWEST)).map((f) => {
    let text = '';
    try { text = fs.readFileSync(path.join(dir, f), 'utf8'); } catch {}
    // renderer/src/every-run.ts reads this line back to join a cut log onto its whole copy.
    if (!whole && text.length > TAIL) text = `… truncated (${text.length} bytes total)\n\n${text.slice(-TAIL)}`;
    return { startedAt: startOf(f), text };
  });
}

// The phone's copy of every thread is built from these, so only each log's end is read off the disk.
// A cut log starts on a whole line, since a thread is read from its lines.
export function readRunTails(dir: string, { newest, chars }: { newest: number; chars: number }): { startedAt: number; text: string }[] {
  return logsIn(dir).slice(-newest).map((f) => {
    let text = '';
    let fd: number | null = null;
    try {
      fd = fs.openSync(path.join(dir, f), 'r');
      const size = fs.fstatSync(fd).size;
      const want = Math.min(size, chars);
      const buf = Buffer.alloc(want);
      fs.readSync(fd, buf, 0, want, size - want);
      text = buf.toString('utf8');
      if (want < size) text = text.slice(text.indexOf('\n') + 1);
    } catch { text = ''; } finally { if (fd !== null) try { fs.closeSync(fd); } catch {} }
    return { startedAt: startOf(f), text };
  });
}
