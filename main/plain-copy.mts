// A plain-JavaScript copy of a .mts program and every file it imports by
// relative path, for a helper started once per agent: without it each start
// loads Node's type-stripping compiler, 25 MB and about 100 ms
// (tests/the-approvals-server-starts-as-plain-javascript).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';

type Strip = (source: string) => string;

const RELATIVE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"\n]+)\2/g;

const plainName = (file: string) => file.replace(/\.mts$/, '.mjs');

const stripTypes: Strip = (source) => stripTypeScriptTypes(source);

// Each agent's start checks the copy on the app's main thread, so a source
// unchanged since it was last read is not stripped again.
const made = new Map<string, { stamp: string; strip: Strip; text: string; deps: string[] }>();

function plainFile(file: string, strip: Strip) {
  const st = fs.statSync(file);
  const stamp = `${st.mtimeMs}:${st.size}`;
  const had = made.get(file);
  if (had && had.stamp === stamp && had.strip === strip) return had;
  const source = fs.readFileSync(file, 'utf8');
  const code = file.endsWith('.mts') ? strip(source) : source;
  const deps: string[] = [];
  const text = code.replace(RELATIVE, (_whole, lead: string, quote: string, spec: string) => {
    deps.push(path.resolve(path.dirname(file), spec));
    return `${lead}${quote}${plainName(spec)}${quote}`;
  });
  const out = { stamp, strip, text, deps };
  made.set(file, out);
  return out;
}

/** Every file the program needs, by its path under `root`, with the text its copy holds. */
function plainFiles(entry: string, root: string, strip: Strip): Map<string, string> {
  const files = new Map<string, string>();
  const visit = (file: string) => {
    const rel = path.relative(root, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`${file} is outside ${root}`);
    const name = plainName(rel);
    if (files.has(name)) return;
    const { text, deps } = plainFile(file, strip);
    files.set(name, text);
    for (const dep of deps) visit(dep);
  };
  visit(path.resolve(entry));
  return files;
}

const same = (file: string, text: string) => {
  try { return fs.readFileSync(file, 'utf8') === text; } catch { return false; }
};

/**
 * The copy's entry file under `intoDir`, written when missing or when any of
 * its files differs from what the sources make, or null when no copy can be
 * made. Never throws.
 */
export function plainCopy(entry: string, intoDir: string, { root, strip = stripTypes }: { root: string; strip?: Strip }): string | null {
  let temp: string | null = null;
  try {
    const files = plainFiles(entry, root, strip);
    const hash = crypto.createHash('sha256');
    for (const [name, text] of [...files].sort(([a], [b]) => a.localeCompare(b))) hash.update(`${name}\0${text}\0`);
    const dir = path.join(intoDir, hash.digest('hex').slice(0, 16));
    const at = path.join(dir, plainName(path.relative(root, path.resolve(entry))));
    if ([...files].every(([name, text]) => same(path.join(dir, name), text))) return at;
    const into = `${dir}.${process.pid}.${Date.now()}`;
    temp = into;
    for (const [name, text] of files) {
      fs.mkdirSync(path.dirname(path.join(into, name)), { recursive: true });
      fs.writeFileSync(path.join(into, name), text);
    }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(into, dir);
    // A server already running has read its files, so older copies can go.
    for (const old of fs.readdirSync(intoDir)) {
      if (/^[0-9a-f]{16}$/.test(old) && old !== path.basename(dir)) fs.rmSync(path.join(intoDir, old), { recursive: true, force: true });
    }
    return at;
  } catch {
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
    return null;
  }
}
