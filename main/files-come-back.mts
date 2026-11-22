// Bringing back, by path, what the cloud keeper took off this computer
// (main/files-cloud.mts): for a cloud run asking the computer for a file
// (main/cloud/resources.mts), and for an agent here, whose store tool
// bring_back_files writes an ask that the app answers.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FilesKeeper } from './files-cloud.mts';

type Keeper = Pick<FilesKeeper, 'hashAt' | 'offUnder' | 'off' | 'bringBack'>;

let keeperNow: () => Keeper | null = () => null;
export function setFilesComeBack(keeper: () => Keeper | null): void { keeperNow = keeper; }

const ASK_MAX_PATHS = 200;
const ASK_KEEP_MS = 10 * 60_000;
const ASK_POLL_MS = 250;

/** Every kept file that left from `place`, or from inside it when it is a folder, brought back. */
export async function bringBackAt(place: string, { max = Infinity }: { max?: number } = {}): Promise<{ back: string[]; failed: string[] }> {
  const keeper = keeperNow();
  if (!keeper) return { back: [], failed: [] };
  const at = path.resolve(place);
  const within = (p: string) => path.resolve(p) === at || path.resolve(p).startsWith(`${at}${path.sep}`);
  const one = keeper.hashAt(at);
  const hashes = [...new Set([...(one ? [one] : []), ...keeper.offUnder(at)])].slice(0, max);
  const back: string[] = [];
  const failed: string[] = [];
  await Promise.all(hashes.map(async (hash) => {
    const there = (keeper.off(hash)?.paths ?? []).filter(within);
    (await keeper.bringBack(hash) ? back : failed).push(...there);
  }));
  return { back, failed };
}

interface Ask { paths: string[]; cwd: string; at: number }
export interface AskAnswer { back: string[]; failed: string[]; notInCloud: string[] }

const answerOf = (dir: string, id: string) => path.join(dir, `${id}.answer.json`);
const answering = new Set<string>();

/** Answers each ask an agent's store tool left in `dir`. A path not written out in full is looked for in each of `bases`. */
export async function answerFileAsks({ dir, bases }: { dir: string; bases: () => string[] }): Promise<void> {
  let names: string[];
  try { names = fs.readdirSync(dir); } catch { return; }
  for (const name of names) {
    const file = path.join(dir, name);
    const st = fs.statSync(file, { throwIfNoEntry: false });
    if (st && Date.now() - st.mtimeMs > ASK_KEEP_MS) { fs.rmSync(file, { force: true }); continue; }
    const id = name.endsWith('.ask.json') ? name.slice(0, -'.ask.json'.length) : null;
    if (!id || answering.has(id) || fs.existsSync(answerOf(dir, id))) continue;
    answering.add(id);
    try {
      const ask = JSON.parse(fs.readFileSync(file, 'utf8')) as Ask;
      const out: AskAnswer = { back: [], failed: [], notInCloud: [] };
      await Promise.all(ask.paths.map(async (asked) => {
        const places = path.isAbsolute(asked) ? [asked] : [path.resolve(ask.cwd, asked), ...bases().map((b) => path.join(b, asked))];
        let found = false;
        for (const place of [...new Set(places)]) {
          const got = await bringBackAt(place);
          if (got.back.length || got.failed.length) found = true;
          out.back.push(...got.back);
          out.failed.push(...got.failed);
        }
        if (!found) out.notInCloud.push(asked);
      }));
      const tmp = `${answerOf(dir, id)}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(out));
      fs.renameSync(tmp, answerOf(dir, id));
    } catch (err) {
      console.warn(`files: could not answer an ask to bring files back: ${(err as Error).message}`);
    } finally { answering.delete(id); }
  }
}

/** The store tool's half: leaves the ask and waits for the app's answer. */
export async function askToBringBack({ dir, paths, cwd, waitMs = 45_000 }: { dir: string; paths: unknown; cwd: string; waitMs?: number }): Promise<AskAnswer & { status: 'back' | 'waiting'; message: string }> {
  if (!Array.isArray(paths) || !paths.length || paths.some((p) => typeof p !== 'string' || !p || p.length > 1024)) throw new Error('paths is a list of the files or folders to bring back');
  if (paths.length > ASK_MAX_PATHS) throw new Error(`ask for at most ${ASK_MAX_PATHS} paths at once; a folder brings back everything in it`);
  fs.mkdirSync(dir, { recursive: true });
  const id = crypto.randomBytes(8).toString('hex');
  const file = path.join(dir, `${id}.ask.json`);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ paths, cwd, at: Date.now() } satisfies Ask));
  fs.renameSync(`${file}.tmp`, file);
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    try {
      const out = JSON.parse(fs.readFileSync(answerOf(dir, id), 'utf8')) as AskAnswer;
      fs.rmSync(file, { force: true });
      fs.rmSync(answerOf(dir, id), { force: true });
      const said = [
        out.back.length ? `${out.back.length} file${out.back.length === 1 ? ' is' : 's are'} back where they were.` : '',
        out.failed.length ? `${out.failed.length} could not come back: the cloud no longer has them, or this computer has no room.` : '',
        out.notInCloud.length ? `Nothing at ${out.notInCloud.join(', ')} is kept in the cloud, so those were never moved there.` : '',
      ].filter(Boolean).join(' ');
      return { status: 'back', ...out, message: said || 'Nothing to bring back.' };
    } catch { /* no answer yet */ }
    await new Promise((r) => setTimeout(r, ASK_POLL_MS));
  }
  return { status: 'waiting', back: [], failed: [], notInCloud: [], message: 'They are still on their way, or the app is not running. Call again with the same paths to wait longer.' };
}
