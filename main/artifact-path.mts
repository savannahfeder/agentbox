// A file a worker named on a card, resolved to a real file ON THAT CARD'S OWN
// PRODUCT, and never anywhere else.
//
// She was right twice over. The finder used to try EVERY product's roots in
// turn, own product first, so a path an Agentbox worker wrote against a folder
// Agentbox does not have fell straight through to whichever product did have one.
// On the card she was reading, nine of eleven chips opened another product's
// files. A chip that opens the wrong file is worse than no chip at all, because
// nothing on screen tells her it is wrong.
//
// Her answer, the same day: "Fix the finder so a card never opens another
// product's file, and say so plainly when it cannot find one."
//
// So there are exactly two rules here:
//
//   1. Every GUESS is made inside one product. The roots below, the
//      account-root retry and the by-name hunt all read one product's trees.
//   2. When the guessing runs out, this returns a sentence rather than a
//      silence, and the caller shows it.
//
// An ABSOLUTE path a worker typed is not a guess: it says exactly which file it
// means, so it still opens as written even when it points outside the product.
// That is the difference this file draws. Deciding for her that an explicit
// path is wrong would break every link into the app's own repo, which is not a
// product at all.
import fsDefault from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { machineryDir } from './store/home.mts';
import { writtenFileNamed } from './store/written-elsewhere.mts';
import { readItemHistory } from './store/work-items.mts';
import { NAME } from '../shared/product-name.mjs';
import { carriedWords } from '../shared/carried-files.mts';
import { carryOf, partFile, shelvedFor, threadFileComing } from './team/carried-shelf.mts';
import type { Dirent } from 'node:fs';
import type { CarryState } from '../shared/carried-files.mts';
import type { ThreadLine } from '../shared/artifact-marks.mts';

export interface ArtifactProduct {
    slug?: string;
    name?: string;
    dir: string;
    repoPath?: string | null;
    team?: { direct?: boolean } | null;
}

export type ArtifactFound =
    | { ok: true; path: string; carry?: CarryState }
    | { ok: false; error: string; waits?: boolean; coming?: boolean; carry?: CarryState };

export type ArtifactFs = Pick<typeof fsDefault, 'existsSync'> & {
    promises: Pick<typeof fsDefault.promises, 'readdir' | 'stat'>;
};

export interface ArtifactRequest {
    src: unknown;
    product?: string | null;
    products?: readonly ArtifactProduct[];
    accountRoot?: string | null;
    storeRoot?: string | null;
    fs?: ArtifactFs;
    now?: number;
    fresh?: boolean;
    nameOf?: ((id: string) => string | null) | null;
    thread?: unknown;
}

export function artifactRoots(prod: ArtifactProduct | null | undefined): string[] {
    if (!prod)
        return [];
    return [
        prod.dir,
        prod.dir && path.join(prod.dir, 'designs'),
        prod.dir && path.join(prod.dir, 'attachments'),
        prod.repoPath,
        prod.repoPath && path.join(prod.repoPath, 'designs'),
        prod.dir && machineryDir(prod.dir),
    ].filter(Boolean) as string[];
}
// Machinery, not artifacts. Walking these is slow and never finds the file a
// worker meant.
//
// `runs` JOINED THIS LIST FOR A SHARPER REASON THAN SLOWNESS. Every card's
// change record is called the same thing, `the-change-it-made.change`, so a
// hunt by basename through `runs/` will always find SOME card's record and
// return it as if it were this one's. MEASURED on her store: asking for's
// change handed back's. This file's own header says a chip that opens the wrong
// file is worse than no chip at all, and that was it happening. A change record
// now resolves by exact path or not at all.
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'sessions', 'runs', 'pending-writes', 'checkpoints']);
// How long one walk of a tree answers for it. A thread asks for every name it
// mentions the moment it opens, so the walk has to outlive that burst; a
// picture that lands later is found by the next look, which comes after this.
export const HUNT_FRESH_MS = 5000;
interface WalkEntry { at: number; fs: ArtifactFs; value: Promise<unknown>; running: boolean; took: number; again?: Promise<unknown> }
const walks = new Map<string, WalkEntry>();
// How many of a walk's folder reads wait on the disk at once. The app's other
// disk reads share four threads with these, and a walk that asked for every
// folder at once kept them waiting for seconds.
const READS_AT_ONCE = 2;
// A folder read that never comes back (a hung mount) ends the walk here, with
// what it found so far, rather than holding every lookup on the tree.
export const WALK_GIVES_UP_MS = 60_000;
// Folders whose read was still out when a walk gave up. Each such read holds one
// of the four disk threads until it returns, so later walks skip the folder
// rather than spending another thread on it.
const stuck = new Set<string>();
// Every file name in one tree, read without holding the main process.
async function walkNames(tree: string, fs: ArtifactFs): Promise<Map<string, string[]>> {
    const names = new Map<string, string[]>();
    const queue: { dir: string; depth: number }[] = [{ dir: tree, depth: 0 }];
    const out = new Set<string>();
    let reading = 0;
    let stopped = false;
    const waiting: ((value?: unknown) => void)[] = [];
    const reader = async (): Promise<void> => {
        for (;;) {
            if (stopped)
                return;
            const next = queue.shift();
            if (!next) {
                if (!reading)
                    return;
                await new Promise((r) => waiting.push(r));
                continue;
            }
            const { dir, depth } = next;
            if (stuck.has(dir))
                continue;
            reading += 1;
            out.add(dir);
            let entries: Dirent[] = [];
            try {
                entries = await fs.promises.readdir(dir, { withFileTypes: true });
            }
            catch { /* gone or unreadable */ }
            out.delete(dir);
            stuck.delete(dir);
            for (const e of entries) {
                if (e.name.startsWith('.'))
                    continue;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) {
                    if (!SKIP.has(e.name) && depth < 6)
                        queue.push({ dir: full, depth: depth + 1 });
                }
                else if (names.has(e.name))
                    names.get(e.name)!.push(full);
                else
                    names.set(e.name, [full]);
            }
            reading -= 1;
            waiting.splice(0).forEach((r) => r());
        }
    };
    let timer: NodeJS.Timeout | undefined;
    const givenUp = new Promise((r) => { timer = setTimeout(r, WALK_GIVES_UP_MS); timer.unref?.(); });
    await Promise.race([Promise.all(Array.from({ length: READS_AT_ONCE }, reader)), givenUp]);
    clearTimeout(timer);
    stopped = true;
    for (const dir of out)
        stuck.add(dir);
    waiting.splice(0).forEach((r) => r());
    return names;
}
// The carried-file shelf and the written-elsewhere list take a whole `fs`, but
// read only what a caller's fake supplies, which is why requests type it narrow.
const whole = (fs: ArtifactFs): typeof fsDefault => fs as typeof fsDefault;
// A walk that took long answers for this many times as long, so a slow disk is
// not walked end to end without a pause, but never past the cap: a file written
// in that time is not found.
const SLOW_WALK_KEEPS = 10;
export const HUNT_KEPT_AT_MOST_MS = 30_000;
// One walk per tree at a time: a name asked while it runs waits on it, even past
// its window. A look that must be current waits for it and then walks again,
// since the running walk may have read a folder before the file was there.
// Each key is only ever read by the one caller that wrote it, so its value comes back as that caller's T.
function freshly<T>(key: string, fs: ArtifactFs, now: number, read: () => T | Promise<T>, fresh = false): Promise<T> {
    const kept = walks.get(key);
    if (kept && kept.fs === fs && kept.running && fresh) {
        kept.again ??= kept.value.then(() => freshly(key, fs, now, read, true));
        return kept.again as Promise<T>;
    }
    const keptFor = (k: WalkEntry) => Math.min(HUNT_KEPT_AT_MOST_MS, Math.max(HUNT_FRESH_MS, k.took * SLOW_WALK_KEEPS));
    if (kept && kept.fs === fs && (kept.running || (!fresh && now - kept.at < keptFor(kept))))
        return kept.value as Promise<T>;
    const started = performance.now();
    const entry: WalkEntry = { at: now, fs, value: Promise.resolve(), running: true, took: 0 };
    const value = Promise.resolve(read()).finally(() => {
        entry.running = false;
        entry.took = performance.now() - started;
    });
    entry.value = value;
    walks.set(key, entry);
    if (walks.size > 32)
        walks.delete(walks.keys().next().value!);
    return value;
}
const namesIn = (tree: string, fs: ArtifactFs, now: number, fresh: boolean): Promise<Map<string, string[]>> => freshly(tree, fs, now, () => walkNames(tree, fs), fresh);
// Hunt the file down by NAME inside one product's trees, newest match wins.
// Workers write links relative to whatever directory they were standing in, so
// a fixed root list will always miss some of them, and every miss cost her a
// 10-minute detour (2026-08-05). Bounded: six levels, own product only.
// A match in the folders the path names beats a newer one of the same name elsewhere.
async function huntByName(base: string, trees: readonly string[], fs: ArtifactFs, now: number, fresh: boolean, raw: string = base): Promise<string | null> {
    let best: { full: string; m: number; fits: boolean } | null = null;
    const tail = raw.includes('/') ? `${path.sep}${raw.split('/').join(path.sep)}` : null;
    for (const tree of trees) {
        for (const full of (await namesIn(tree, fs, now, fresh)).get(base) ?? []) {
            let m;
            try {
                m = (await fs.promises.stat(full)).mtimeMs;
            }
            catch {
                continue;
            }
            const fits = !!tail && full.endsWith(tail);
            if (!best || (fits && !best.fits) || (fits === best.fits && m > best.m))
                best = { full, m, fits };
        }
    }
    return best?.full ?? null;
}
// What she reads when the file is not there. Plain sentences, her vocabulary:
// this ends up in a toast under her cursor, not in a log.
export function notFoundMessage(raw: string, own: ArtifactProduct | null | undefined, product: string | null | undefined): string {
    const name = own?.name || product || 'this project';
    if (!own)
        return `${raw} could not be opened. ${product ? `“${product}”` : 'That project'} is not set up in ${NAME}.`;
    return `${raw} is not in ${name}. Nothing was opened.`;
}
const THREAD_ID = /^w-[0-9a-f]{6,}$/i;
// A script's output is in no record of what an agent wrote, and a run works in
// its own checkout, which the hunt skips for being hidden. So a name means a file
// in the checkout of the thread asked about, or else of a thread whose own words
// name it: never a checkout that merely holds a file of that name.
//
// Every name nothing else found comes through here, on the main process, and a
// repo can hold hundreds of checkouts: no synchronous call into them.
async function fileInCheckout(own: Pick<ArtifactProduct, 'dir' | 'repoPath'>, raw: string, thread: unknown, fs: ArtifactFs, now: number, fresh: boolean): Promise<string | null> {
    if (!own.repoPath || raw.split('/').includes('..'))
        return null;
    const root = path.join(own.repoPath, '.claude', 'worktrees');
    const base = path.basename(raw);
    const within = async (id: string): Promise<{ id: string; file: string; at: number } | null> => {
        for (const rel of [raw, base, path.join('shots', base), path.join('designs', base)]) {
            const file = path.join(root, id, rel);
            try {
                return { id, file, at: (await fs.promises.stat(file)).mtimeMs };
            }
            catch { /* the next place */ }
        }
        return null;
    };
    if (thread && THREAD_ID.test(String(thread))) {
        const mine = await within(String(thread));
        if (mine)
            return mine.file;
    }
    const list = (): Promise<string[]> => fs.promises.readdir(root).catch(() => []);
    const ids = (await freshly(`checkouts:${root}`, fs, now, list, fresh)).filter((id) => THREAD_ID.test(id));
    const hits = (await Promise.all(ids.map(within))).filter((hit) => hit !== null).sort((a, b) => b.at - a.at);
    return hits.find((hit) => threadNames(own.dir, hit.id, base))?.file ?? null;
}
function threadNames(dir: string, id: string, base: string): boolean {
    try {
        return readItemHistory(dir, id).some((l: ThreadLine | null) => ['body', 'answer', 'result', 'note'].some((k) => {
            const said = l?.patch?.[k];
            return typeof said === 'string' && said.includes(base);
        }));
    }
    catch {
        return false;
    }
}
// Resolve one worker-written path. Returns { ok: true, path } or
// { ok: false, error } where the error is a sentence for her, not a code.
//
// `products` is the whole list only so the card's own product can be found in
// it. Nothing in here reads another entry.
export async function resolveArtifact({ src, product, products = [], accountRoot, storeRoot, fs = fsDefault, now = Date.now(), fresh = false, nameOf = null, thread = null }: ArtifactRequest): Promise<ArtifactFound> {
    if (typeof src !== 'string' || !src)
        return { ok: false, error: 'No file was named.' };
    const raw = decodeURIComponent(src.replace(/^file:\/\//, '')).replace(/^\.\//, '');
    const own = products.find((x) => x.slug === product) ?? null;
    const roots = artifactRoots(own);
    // In a conversation a name means the file that came with the message, first:
    // the same words on this computer may be a different file, or nothing at all.
    const direct = own?.team?.direct === true;
    const carried = direct ? shelvedFor(own.dir, raw, { fs: whole(fs) }) : null;
    // How the file got to the people on the conversation, for its tile. It rides
    // on every answer about a name that was carried.
    // carryOf may ask for `undefined`, which a lookup by id answers with nobody.
    const shelf = { dir: own?.dir, nameOf: (nameOf ?? (() => null)) as (id: string | undefined) => string | null, now, fs: whole(fs) };
    const carry = carried ? carryOf(carried, shelf) : null;
    // A guess that it is coming says nothing once the file is here.
    const withCarry = (r: ArtifactFound): ArtifactFound => (carry && !(r.ok && carried!.expecting) ? { ...r, carry } : r);
    if (carried && own) {
        if (carried.parts) {
            const main = carried.parts.find((p) => p.path === carried.main);
            let file = main && partFile(own.dir, carried, main);
            // A big file is not copied beside the sender's own: theirs is the one that opens.
            if (!(file && fs.existsSync(file)) && carried.mine && carried.here && fs.existsSync(carried.here))
                file = carried.here;
            if (file && fs.existsSync(file))
                return withCarry({ ok: true, path: file });
            if (carry?.state === 'failed')
                return withCarry({ ok: false, waits: true, error: carriedWords.cannot(raw, carry.why, false) });
            return withCarry({ ok: false, coming: true, error: carriedWords.coming(raw) });
        }
        if (carried.tooBig) {
            if (carried.here && fs.existsSync(carried.here))
                return withCarry({ ok: true, path: carried.here });
            return withCarry({ ok: false, error: carriedWords.tooBig(raw, carried.tooBig) });
        }
        if (carried.mine && (carried.coming || carried.failed)) {
            if (carried.here && fs.existsSync(carried.here))
                return withCarry({ ok: true, path: carried.here });
            if (carried.failed)
                return withCarry({ ok: false, error: carriedWords.cannot(raw, carried.why, true) });
            return withCarry({ ok: false, coming: true, error: carriedWords.coming(raw) });
        }
        // The sender's word is final, and a "Try again" on their side may still change it.
        if (carried.cannot && !carried.mine)
            return withCarry({ ok: false, waits: true, error: carriedWords.cannot(raw, carried.why, false) });
    }
    const candidates: string[] = [];
    if (path.isAbsolute(raw)) {
        // Said in full, so taken at its word.
        candidates.push(raw);
        // Workers also write an absolute path with a segment missing (the account
        // root straight onto reports/, no product slug). The remainder is a guess,
        // so it is retried under THIS product's roots and no other.
        for (const base of [accountRoot, storeRoot].filter(Boolean) as string[]) {
            if (raw.startsWith(base + path.sep)) {
                const rest = raw.slice(base.length + 1);
                for (const root of roots)
                    candidates.push(path.join(root, rest));
            }
        }
    }
    else {
        for (const root of roots)
            candidates.push(path.join(root, raw));
        // AND THE WORKER'S OWN CHECKOUT, when the path names its task. Every run
        // works in `<repo>/.claude/worktrees/<task id>` (./task-folders.mts), so
        // `designs/w-1b574413db/a1.png` is relative to that folder, and the hunt
        // below never finds it because it skips every folder starting with a dot.
        // Only a task the path itself names: a bare `shots/a.png` must not reach
        // into some other task's checkout (2026-10-04, w-7fe215448b).
        if (own?.repoPath) {
            for (const segment of raw.split('/')) {
                if (/^w-[0-9a-f]{6,}$/i.test(segment))
                    candidates.push(path.join(own.repoPath, '.claude', 'worktrees', segment, raw));
            }
        }
    }
    // The thread's own checkout is where its agent wrote, so its files come before
    // any of the same name found elsewhere.
    const mine = !path.isAbsolute(raw) && own?.repoPath && thread && THREAD_ID.test(String(thread)) && !raw.split('/').includes('..')
        ? path.join(own.repoPath, '.claude', 'worktrees', String(thread)) : null;
    if (mine)
        candidates.unshift(path.join(mine, raw));
    for (const full of candidates) {
        if (fs.existsSync(full))
            return withCarry({ ok: true, path: full });
    }
    if (mine && raw.split('/')[0] !== 'runs') {
        const found = await huntByName(path.basename(raw), [mine], fs, now, fresh, raw);
        if (found)
            return withCarry({ ok: true, path: found });
    }
    // The hunt takes the two TREES, not the root list: designs/ and attachments/
    // sit inside the docs dir already, and walking them twice finds nothing new.
    // A run's change record is found by exact path or not at all: the open thread
    // asks for it on every refresh, and any other match is some other run's.
    const base = path.basename(raw);
    const trees = own ? [own.dir, own.repoPath].filter(Boolean) as string[] : [];
    const changeRecord = raw.split('/')[0] === 'runs';
    if (base && trees.length && !changeRecord) {
        const found = await huntByName(base, trees, fs, now, fresh, raw);
        if (found)
            return withCarry({ ok: true, path: found });
    }
    // What this project's agents wrote into her other folders: a fact, not a guess.
    if (own?.dir && !path.isAbsolute(raw) && !changeRecord) {
        const wrote = writtenFileNamed(own.dir, raw, { fs: whole(fs) });
        if (wrote)
            return withCarry({ ok: true, path: wrote });
        const inCheckout = await fileInCheckout({ dir: own.dir, repoPath: own.repoPath }, raw, thread, fs, now, fresh);
        if (inCheckout)
            return withCarry({ ok: true, path: inCheckout });
    }
    // The sender said there is nothing behind this word: no tile, no waiting.
    if (carried?.quiet)
        return { ok: false, error: notFoundMessage(raw, own, product) };
    if (carried?.cannot)
        return withCarry({ ok: false, error: carriedWords.cannot(raw, carried.why, true) });
    // A teammate's thread lists this file but it has not come down yet.
    const hereComing = own?.slug?.startsWith('shared-thread:') && raw.startsWith('attachments/') ? threadFileComing(own.dir, path.basename(raw), { fs: whole(fs) }) : null;
    if (hereComing)
        return { ok: false, coming: true, carry: hereComing, error: carriedWords.coming(raw) };
    // Nothing has said it will not come, so it is still on its way.
    if (direct)
        return withCarry({ ok: false, coming: true, error: carriedWords.coming(raw) });
    return { ok: false, error: notFoundMessage(raw, own, product) };
}
