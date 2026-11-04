// The logs a thread's runs wrote, one per run, under sessions/<item-id>/.
import fs from 'node:fs';
import path from 'node:path';

// The regular read runs on every push while an agent works, so it stays small.
// `whole` is the read for a thread whose middle was asked for, and it is made once.
const NEWEST = 20;
const TAIL = 120_000;

export function readRunTraces(dir, { whole = false } = {}) {
  let files;
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.log')).sort(); } catch { return []; }
  return (whole ? files : files.slice(-NEWEST)).map((f) => {
    let text = '';
    try { text = fs.readFileSync(path.join(dir, f), 'utf8'); } catch {}
    // renderer/src/every-run.ts reads this line back to join a cut log onto its whole copy.
    if (!whole && text.length > TAIL) text = `… truncated (${text.length} bytes total)\n\n${text.slice(-TAIL)}`;
    return { startedAt: Number(f.replace('.log', '')) || 0, text };
  });
}
