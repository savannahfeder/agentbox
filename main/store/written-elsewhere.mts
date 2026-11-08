// The files a project's agents wrote outside the project's own folders, so a
// name an agent says in its thread still opens there (main/artifact-path.mts).
// Only what an agent really wrote is listed: a guess into another project could
// open the wrong file.
import fsDefault from 'node:fs';
import path from 'node:path';
import { machineryDir } from './home.mts';

const FILE = 'written-elsewhere.jsonl';
const KEEP = 400;
const TRIM_AT = 256 * 1024;

export interface ElsewhereOptions { home?: string; now?: number; fs?: typeof fsDefault }

const listFile = (projectDir: string, home: string | undefined) => path.join(machineryDir(projectDir, home), FILE);

export function noteWrittenElsewhere(
  projectDir: string, { run = null, file }: { run?: string | null; file: unknown },
  { home, now = Date.now(), fs = fsDefault }: ElsewhereOptions = {},
): void {
  if (!projectDir || typeof file !== 'string' || !path.isAbsolute(file)) return;
  const at = listFile(projectDir, home);
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.appendFileSync(at, `${JSON.stringify({ run, file: path.resolve(file), at: now })}\n`);
  try {
    if (fs.statSync(at).size > TRIM_AT) fs.writeFileSync(at, `${fs.readFileSync(at, 'utf8').split('\n').filter(Boolean).slice(-KEEP).join('\n')}\n`);
  } catch { /* the next note trims it */ }
}

/** Every file noted for this project, newest first, each once. */
export function writtenElsewhere(projectDir: string, { home, fs = fsDefault }: ElsewhereOptions = {}): string[] {
  let text: string;
  try { text = fs.readFileSync(listFile(projectDir, home), 'utf8'); } catch { return []; }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split('\n').filter(Boolean).slice(-KEEP).reverse()) {
    let e: { file?: unknown } | null;
    try { e = JSON.parse(line); } catch { continue; }
    if (typeof e?.file !== 'string' || seen.has(e.file)) continue;
    seen.add(e.file);
    out.push(e.file);
  }
  return out;
}

const WRITING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/** The absolute paths one line of Claude Code's stream writes to. */
interface StreamBlock { type?: string; name?: string; input?: { file_path?: unknown; notebook_path?: unknown } }

export function writesInClaudeLine(line: unknown): string[] {
  if (typeof line !== 'string' || !line.includes('"tool_use"')) return [];
  let obj: { type?: string; message?: { content?: unknown } } | null;
  try { obj = JSON.parse(line); } catch { return []; }
  if (obj?.type !== 'assistant' || !Array.isArray(obj.message?.content)) return [];
  return (obj.message.content as (StreamBlock | null)[])
    .filter((b) => b?.type === 'tool_use' && WRITING_TOOLS.has(b.name!))
    .map((b) => b!.input?.file_path ?? b!.input?.notebook_path)
    .filter((f): f is string => typeof f === 'string' && path.isAbsolute(f));
}

const inside = (root: string | null, file: string) => !!root && (file === root || file.startsWith(root + path.sep));

/**
 * Notes what one stream line writes outside the places the finder already
 * looks: the project's folder and the repo's own (not hidden) files. A run's
 * checkout sits under the repo's hidden `.claude` folder, so it is noted.
 */
export function noteAgentWrites(
  product: { dir?: string; repoPath?: string | null } | null | undefined, run: string | null, line: unknown, opts: ElsewhereOptions = {},
): void {
  if (!product?.dir) return;
  for (const raw of writesInClaudeLine(line)) {
    const file = path.resolve(raw);
    if (inside(path.resolve(product.dir), file)) continue;
    const repo = product.repoPath ? path.resolve(product.repoPath) : null;
    if (inside(repo, file) && !path.relative(repo!, file).split(path.sep).some((s) => s.startsWith('.'))) continue;
    noteWrittenElsewhere(product.dir, { run, file }, opts);
  }
}

/** The newest noted file that a name (`shot-list.md`, `docs/shot-list.md`) means, if it is still there. */
export function writtenFileNamed(projectDir: string, raw: unknown, { home, fs = fsDefault }: ElsewhereOptions = {}): string | null {
  const rel = String(raw ?? '').replace(/^\.\//, '');
  if (!rel || path.isAbsolute(rel) || rel.split('/').includes('..')) return null;
  const tail = `${path.sep}${rel.split('/').join(path.sep)}`;
  for (const file of writtenElsewhere(projectDir, { home, fs })) {
    if (file.endsWith(tail) && fs.existsSync(file)) return file;
  }
  return null;
}
