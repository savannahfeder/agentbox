// FINDING A CLAUDE CODE TRANSCRIPT WITHOUT HOLDING THE APP MORE THAN ONCE.
//
// Claude Code keeps a session at `<projects>/<slug of its folder>/<id>.jsonl`.
// When it is not there the only way to find it is to look in every folder:
// ten thousand on a busy Mac, 1.4 s on the window's thread. So a session found
// nowhere is not looked for again for ten minutes, and a caller picks how to look:
//   'now'    in this call, for an answer that decides a resume (an imported
//            thread is filed under the folder it first ran in)
//   'later'  in the background; this call answers null, a later one finds it
//   'never'  only at the slug path: a cloud run's transcript comes home there
//            and nowhere else (main/cloud/run.mts transcriptFolderName)
import fs from 'node:fs';
import path from 'node:path';

export const MISS_KEPT_MS = 10 * 60_000;

const found = new Map<string, string>();  // `${projects}\0${id}` -> transcript path
const missed = new Map<string, number>(); // `${projects}\0${id}` -> when it was last looked for and not found
const wanted = new Map<string, Set<string>>(); // projects folder -> session ids to look for
let search: Promise<void> | null = null;

export const slugFor = (cwd: unknown) => String(cwd || '').replace(/[^a-zA-Z0-9]/g, '-');
const keyOf = (projects: string, id: string) => `${projects}\0${id}`;

function remember(projects: string, id: string, file: string | null) {
  if (file) { found.set(keyOf(projects, id), file); missed.delete(keyOf(projects, id)); return; }
  missed.set(keyOf(projects, id), Date.now());
  while (missed.size > 1000) missed.delete(missed.keys().next().value!);
}

/** The transcript's path, or null. `look` says where else to look when it is not at the slug path. */
export function findTranscript(projects: string | null | undefined, sessionId: string | null | undefined, cwd: string | null | undefined, { look = 'later' }: { look?: 'now' | 'later' | 'never' } = {}): string | null {
  if (!projects || !sessionId) return null;
  const key = keyOf(projects, sessionId);
  const known = found.get(key);
  if (known && fs.existsSync(known)) return known;
  // Claude Code names the folder from the resolved path: /tmp is /private/tmp on a Mac.
  let real = cwd;
  try { real = cwd ? fs.realpathSync(cwd) : cwd; } catch { /* the folder is gone */ }
  for (const at of new Set([cwd, real])) {
    const direct = path.join(projects, slugFor(at), `${sessionId}.jsonl`);
    if (fs.existsSync(direct)) { found.set(key, direct); return direct; }
  }
  if (look === 'never' || Date.now() - (missed.get(key) ?? -Infinity) < MISS_KEPT_MS) return null;
  if (look === 'later') { lookEverywhere(projects, sessionId); return null; }
  let file: string | null = null;
  try {
    for (const dir of fs.readdirSync(projects)) {
      const p = path.join(projects, dir, `${sessionId}.jsonl`);
      if (fs.existsSync(p)) { file = p; break; }
    }
  } catch { /* no projects folder */ }
  remember(projects, sessionId, file);
  return file;
}

function lookEverywhere(projects: string, sessionId: string) {
  if (!wanted.has(projects)) wanted.set(projects, new Set());
  wanted.get(projects)!.add(sessionId);
  search ??= (async () => {
    while (wanted.size) {
      const [root, ids] = wanted.entries().next().value!;
      wanted.delete(root);
      const left = new Set(ids);
      let dirs: string[] = [];
      try { dirs = await fs.promises.readdir(root); } catch { /* no projects folder */ }
      for (const dir of dirs) {
        if (!left.size) break;
        for (const id of [...left]) {
          const p = path.join(root, dir, `${id}.jsonl`);
          try { await fs.promises.access(p); remember(root, id, p); left.delete(id); } catch { /* not here */ }
        }
      }
      for (const id of left) remember(root, id, null);
    }
  })().finally(() => { search = null; });
}

/** The background look, when one is running; settled otherwise. */
export const transcriptSearch = () => search ?? Promise.resolve();
