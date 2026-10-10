// The app side of the approvals channel: read what workers are waiting on,
// write the founder's decision. Pure file protocol against the spool dir the
// approval-prompt server polls, so a restart on either side loses nothing.
//
// ------------------------------------------------------------------------
// THE SPOOL IS A DIRECTORY THE ADVERSARY CAN WRITE IN, AND THAT IS THE WHOLE
// REASON THE FILE OPERATIONS BELOW ARE NOT THE OBVIOUS ONES (2026-09-04).
//
// It lives at `<storeRoot>/.approvals`. `writeWorkerSettings` puts the store
// root in `additionalDirectories` and `worker-permissions.json` allows Bash
// broadly, so a Claude Code worker can list this directory and create files in
// it. That is not a misconfiguration to be narrowed here -- what an agent may
// do on her machine is section 7 of the terms and hers to decide -- it is the
// threat model this file is written against. Measured on this Mac, node
// v22.19.0:
//
//     fs.writeFileSync(<symlink>, x)         -> writes THROUGH it, to the target
//     fs.appendFileSync(<symlink>, x)        -> appends THROUGH it
//     fs.readFileSync(<fifo>)                -> blocks the process, forever
//     fs.openSync(<symlink>, 'wx')           -> EEXIST
//     open(..., O_APPEND|O_CREAT|O_NOFOLLOW) -> ELOOP
//     open(..., O_RDONLY|O_NONBLOCK) + fstat -> returns, and says isFIFO
//     fs.renameSync(tmp, <symlink>)          -> replaces the LINK; target intact
//     fs.rmSync(<symlink>, {recursive:true}) -> removes the LINK; target intact
//
// The first three lines are what the top three used to be. So: nothing in this
// directory is ever opened through a link, nothing is opened that is not a
// regular file, and every write lands by creating at a name nothing can guess
// and renaming onto the real one. The helpers are here rather than in each
// caller because two copies of that rule are one edit away from disagreeing,
// and the half that forgets is the half with the hole.
//
// AND NOTHING IN A REQUEST FILE IS BELIEVED ABOUT TIME. `at` is a worker's own
// account of itself; the order her cards stack in is Agentbox's, see
// `listPending`.
//
// WHAT THIS STILL DOES NOT CLAIM. A worker that can write here can still put A
// card in front of her: a file is the whole of the Claude Code protocol
// (main/approval-prompt-server.mjs waits in another process and has no other
// channel), so a request's provenance cannot be proved. What it can no longer
// do is aim her click at a file of hers, append to one, put its card in front
// of every card that came before it, or leave that card there.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function spoolDir(storeRoot) {
  return path.join(storeRoot, '.approvals');
}

/* ------------------- whose answer this is, provably --------------------- */
//
// THE FILE STOPS BEING A CHANNEL FOR APPROVING ANYTHING (2026-09-05).
//
// main/approval-prompt-server.mjs read `if (answer?.allow) return { behavior:
// 'allow' }` off this directory, and the paragraph at the top of this file is
// the whole reason that was an approval anybody could write: the store root is
// in `additionalDirectories` and Bash is allowed broadly, so a worker could
// approve another worker's card, or start a watcher and approve its own the
// instant it raised one.
//
// The Codex half was closed by moving the decision in process. This half cannot
// be: the thing waiting is a SEPARATE PROCESS, spawned by the CLI as the
// worker's own child, and a file is the whole of the protocol it has.
//
// AND NO SHARED SECRET CLOSES IT EITHER, which is worth writing down so nobody
// re-derives it: anything handed to that server is handed through the worker's
// own environment, and the worker can read it. A token is a token the forger
// has.
//
// SO THE SECRET IS ONE THAT ONLY HAS TO BE CHECKED THERE, NEVER HELD THERE.
// Agentbox keeps an ed25519 private key in its own process and hands the worker's
// MCP server the PUBLIC half, which verifies and cannot sign. The signature
// covers the request id, the verdict, the note and the moment TOGETHER, so a
// decision cannot be moved onto another card, flipped from a deny into an
// allow, or replayed onto a later one.
//
// THE PAIR IS PER RUN OF AGENTBOX, deliberately: a key file in her home is a key
// a worker can read, and there is nothing to persist for -- every card is
// answered by the process that raised it, and restarting Agentbox kills every
// worker anyway (CLAUDE.md, process etiquette). Made on first use rather than
// at import, so a machine that never raises a card never pays for it.
//
// WHAT IS STILL NOT CLOSED, and it is not closeable from this repository. That
// MCP server is the worker's own child at the same uid. It cannot read Agentbox's
// memory -- macOS wants root or an entitlement for that -- so no signature can
// be made. What a same-uid process CAN do is kill it, or attach to it and patch
// the check out. Stopping that means the worker being allowed less, which is
// `worker-permissions.json`, which is section 7 of the terms and hers.

let pair = null;
const keys = () => (pair ??= crypto.generateKeyPairSync('ed25519'));

/** The half it is safe to hand a worker: it verifies and it cannot sign. */
export function approvalPublicKey() {
  return keys().publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

/* ------------------ WHAT the answer is an answer FOR --------------------- */
//
// A SIGNATURE OVER AN ID PROVES NOTHING ABOUT WHAT SHE AGREED TO (2026-09-05).
//
// `decisionBytes` covered `[id, allow, note, at]`, and the request file is one
// the adversary can write in: a file's NAME and the id inside it survive while
// its CONTENTS are replaced. So a worker raised `rm -rf ~/Zero`, rewrote its own
// request in place with `echo hi`, `listPending` drew `echo hi`, she pressed
// Allow -- and the process waiting on that id was STILL HOLDING the first
// command and verified her signature happily. The signature was real and it
// said only "yes to <uuid>". Codex has the same shape from the other end:
// `settle` takes an id and a verdict while `open` holds the original, and a
// Claude Code worker can write in the spool both engines draw their cards from.
//
// SO THE DECISION IS BOUND TO THE ACTION. `answer` signs a digest of the card
// Agentbox last put in front of her, alongside the verdict, and each engine
// compares that digest against the request IT is holding before allowing
// anything -- main/approval-prompt-server.mjs against its own in-memory
// `request`, main/codex-approvals.mjs against its own `open` entry. A mismatch
// is a deny, on both.
//
// THE DIGEST IS OF WHAT WAS DISPLAYED, NOT OF THE FILE AT ANSWER TIME, and that
// difference is the whole fix. Re-reading the request inside `answer` looks
// equivalent: a worker flipping the file between a harmless body and the real
// one then wins every time her press lands on a harmless draw and the re-read
// catches the real body. `listPending` is the only thing in the app that reads
// a request, and each of its three callers acts on or draws exactly what it
// returned -- the snapshot (main/ipc.mjs), the ⌘Y/⌘N chord and the Agents menu
// (main/main.mjs) -- so the digest taken there IS the card she is looking at.
//
// AND CANONICALISATION IS THE PART THAT FAILS QUIETLY. A digest that disagrees
// with itself across the round trip through the file denies every approval on
// the machine, with nothing on any screen saying why. Both sides hold JSON: the
// engine's own object, and Agentbox's parse of the file that object was
// stringified into. So the digest is taken over a canonical form after ONE JSON
// round trip -- which resolves `toJSON`, drops `undefined` from objects and
// turns it and NaN into null inside arrays, exactly as the write to disk did --
// and then sorts keys, because two objects carrying the same fields in a
// different order are the same card.

/** One JSON value as one string, with the key order taken out of it. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v) ?? 'null').join(',')}]`;
  if (value && typeof value === 'object') {
    const fields = [];
    for (const key of Object.keys(value).sort()) {
      const v = canonical(value[key]);
      if (v !== undefined) fields.push(`${JSON.stringify(key)}:${v}`);
    }
    return `{${fields.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * THE CARD, AS ONE STRING EITHER SIDE CAN ARRIVE AT INDEPENDENTLY.
 *
 * Null for anything that is not a request object and for anything JSON cannot
 * express (a cycle, a BigInt). Null is never equal to a digest, so every caller
 * reads it as a mismatch and denies, which is the safe direction in all three.
 *
 * NOTHING IS NORMALISED beyond what JSON itself did. Two byte strings that draw
 * the same glyph are two different commands, and Agentbox deciding otherwise
 * would be Agentbox deciding what her shell will do with them.
 */
export function cardDigest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return null;
  let text;
  try { text = canonical(JSON.parse(JSON.stringify(request))); } catch { return null; }
  if (typeof text !== 'string') return null;
  return crypto.createHash('sha256').update(text, 'utf8').digest('base64');
}

/**
 * THE EXACT BYTES A SIGNATURE COVERS, and every field of the decision is in
 * them, including WHICH CARD it was a decision about. An array rather than an
 * object, because two JSON objects carrying the same fields in a different
 * order are different bytes, and the verifier rebuilds this from a PARSED file
 * rather than from the text on disk.
 */
function decisionBytes(id, allow, note, at, card) {
  return Buffer.from(JSON.stringify([String(id), !!allow, note ?? null, at ?? null, card ?? null]), 'utf8');
}

/**
 * Whether this answer is one Agentbox wrote for THIS request. False for every
 *  shape that is not, including the one a worker with a shell writes, and
 *  including one whose `card` has been edited away from the digest she really
 *  signed -- so the binding cannot be stripped back off a real decision. */
export function answerIsHers(id, answer, publicKey = approvalPublicKey()) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false;
  if (typeof answer.sig !== 'string' || !answer.sig) return false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    return crypto.verify(null, decisionBytes(id, answer.allow, answer.note, answer.at, answer.card), key, Buffer.from(answer.sig, 'base64'));
  } catch {
    return false;
  }
}

/**
 * HOW LONG A REQUEST FILE MAY OUTLIVE ANYONE WHO COULD ANSWER IT.
 *
 * Both engines give up on a card after fifteen minutes and delete the pair when
 * they do: main/approval-prompt-server.mjs's `TIMEOUT_MS`, and
 * main/codex-approvals.mjs's `timeoutMs`, which defaults to the transport's
 * `APPROVAL_TIMEOUT_MS`. A request still on disk past that is either a forgery
 * or the leftovers of a worker that died before its own deadline, and in both
 * cases it is a question nothing can answer.
 *
 * A minute over the longest of them, and never under: being early takes a live
 * card off her screen, being late leaves a dead one there one more minute.
 * tests/a-card-a-worker-forged-cannot-hold-the-front-of-her-stack.test.mjs
 * checks that against both of those constants rather than trusting this
 * comment.
 */
export const REQUEST_TTL_MS = 16 * 60_000;

/**
 * The largest request file worth opening. main/codex-approvals.mjs already
 *  cuts a card's text at CARD_CAP (4,000 characters), and a Claude Code tool
 *  input that reached a megabyte could not be read on a card anyway -- so this
 *  is only ever a bound on what a worker can make Agentbox hold in memory on
 *  every poll of the inbox. Past it the file is skipped exactly the way an
 *  unparseable one always has been, and the TTL above takes it away. */
export const MAX_REQUEST_BYTES = 1024 * 1024;

const O_NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0; // undefined on Windows, which this app is not
const READ_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | O_NOFOLLOW;
const APPEND_FLAGS = fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | O_NOFOLLOW;

/**
 * Whether the spool holds an entry by this name, WHATEVER it is. `lstat`
 *  rather than `existsSync`, which resolves a link and so answers "no" for a
 *  dangling one that `readdir` can plainly see. */
export function spoolEntryExists(dir, name) {
  try { fs.lstatSync(path.join(dir, name)); return true; } catch { return false; }
}

/**
 * Take an entry out of the spool, whatever a worker made it. `rm` unlinks a
 *  symlink rather than descending it, so this never reaches outside the spool,
 *  and it removes the directory that `unlink` refuses (EPERM, measured). */
export function removeSpoolEntry(dir, name) {
  try { fs.rmSync(path.join(dir, name), { recursive: true, force: true }); } catch { /* already gone */ }
}

/**
 * One spool file as the object it should hold, or null.
 *
 * O_NOFOLLOW so a request symlinked at one of her files is never opened,
 * O_NONBLOCK so a named pipe wearing a request file's name cannot freeze the
 * main process inside a synchronous read, and `fstat` on the descriptor we
 * actually got rather than an `lstat` on the name, which would leave a window
 * to swap underneath.
 */
export function readSpoolJson(dir, name) {
  let fd = null;
  try {
    fd = fs.openSync(path.join(dir, name), READ_FLAGS);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_REQUEST_BYTES) return null;
    return JSON.parse(fs.readFileSync(fd, 'utf8'));
  } catch {
    return null;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* already closed */ } }
  }
}

/**
 * Put a file in the spool, without ever writing through what is already there.
 *
 * The exclusive create is at a name nothing can guess, so it cannot be
 * pre-created; the rename is atomic and replaces the destination's directory
 * entry without resolving it, so a planted link is destroyed rather than
 * followed AND her decision still lands on the first press. Plain `wx` on the
 * final name would refuse to follow but would also throw her click away
 * whenever anything squatted the name, and a lost Allow is the silence this
 * app is built not to produce.
 *
 * The second attempt is for the one squatter `rename` cannot replace: a
 * directory (EISDIR, measured), which is also what `unlink` refuses. Removing
 * it is safe for the reason `removeSpoolEntry` gives.
 */
export function writeSpoolFile(dir, name, text) {
  const dest = path.join(dir, name);
  const tmp = path.join(dir, `.${crypto.randomUUID()}.tmp`);
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, text);
    fs.closeSync(fd);
    fd = null;
  } catch {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* already closed */ } }
    try { fs.unlinkSync(tmp); } catch { /* never got made */ }
    return false;
  }
  try { fs.renameSync(tmp, dest); return true; } catch { /* something unreplaceable is there */ }
  try {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(tmp, dest);
    return true;
  } catch { /* the spool itself will not take a write; the caller denies */ }
  try { fs.unlinkSync(tmp); } catch { /* best effort */ }
  return false;
}

/**
 * ONE AUDIT LINE, AND NEVER INTO A FILE OF HERS.
 *
 * `log.jsonl` is a FIXED name in a directory a worker can write in, so unlike
 * the answer file it needs no guessing at all, and the bytes appended carry the
 * worker's own `command` string. Symlinked at `briefs/founder.md` that is
 * agent-authored text inside the standing instructions every session is briefed
 * with, appended once per decision, forever.
 *
 * O_NOFOLLOW closes it with no window between a check and the write. But
 * refusing alone would hand the attacker the audit trail: both callers swallow
 * a failure here on purpose (a decision is never held hostage to its log line),
 * so a planted link would end auditing silently and for good. An entry that is
 * not a regular file is therefore destroyed and a real one opened in its place,
 * out loud -- this is the one warning in this area that always means a worker
 * attacked the spool.
 */
export function appendSpoolLine(dir, name, line) {
  if (appendOnce(dir, name, line)) return true;
  let squatter = null;
  try { squatter = fs.lstatSync(path.join(dir, name)); } catch { return false; }
  if (squatter.isFile()) return false; // a real log we simply could not write to
  console.warn(`zero: ${name} in the approvals spool was ${squatter.isSymbolicLink() ? 'a link' : 'not a file'}, which only a worker can have done; it has been removed and the audit line written to a real one`);
  removeSpoolEntry(dir, name);
  return appendOnce(dir, name, line);
}

function appendOnce(dir, name, line) {
  let fd = null;
  try {
    fd = fs.openSync(path.join(dir, name), APPEND_FLAGS, 0o600);
    fs.writeFileSync(fd, line);
    return true;
  } catch {
    return false;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* already closed */ } }
  }
}

/**
 * WHEN THIS PROCESS FIRST SAW EACH REQUEST, which is the only clock in that
 * directory a worker cannot write to.
 *
 * `listPending` used to sort by `a.at`, read straight out of the request file.
 * A worker writes `<uuid>.request.json` with `at: 0` and owns the front of the
 * stack -- and that is not one bad card, it is every card, because the renderer
 * draws only the front one and ⌘Y/⌘N and the Agents menu all act on
 * `listPending[0]`. Her keystroke answers the decoy while the question she is
 * reading waits behind it.
 *
 * So `at` is not read for ordering at all any more. `seq` is taken at the
 * sighting and only ever increases, which makes the order total as well as
 * unforgeable; the timestamp beside it is what the TTL is measured from. A
 * floor on the worker's own `at` was the other candidate and it is weaker: a
 * legitimate `at` is written moments before Agentbox sees the file, so it needs a
 * tolerance, and that tolerance is exactly the window a forgery is planted in.
 *
 * Keyed by directory as well as by id because the suite runs many spools, and
 * pruned against what is really on disk on every pass, so it cannot grow.
 */
const seenAt = new Map();
let sightings = 0;

const REQUEST_SUFFIX = '.request.json';

/**
 * WHICH OF TWO REQUESTS FIRST SEEN IN THE SAME PASS CAME FIRST.
 *
 * A sighting is only as fine as the poll that made it, so cards that appear
 * inside one interval share a timestamp and something has to break the tie.
 * `readdir` is the wrong answer: measured on this Mac it comes back in NAME
 * order, and a forgery names itself, so a worker watching the spool could plant
 * a decoy the instant a real card appeared and sort itself in front of it.
 *
 * `ctime` is the right one, and it is the only timestamp here that is any use:
 * an unprivileged process can move a file's mtime and its BIRTHTIME backwards
 * -- measured, `utimes(epoch)` set both to 0 -- and the same call pushed ctime
 * FORWARD to now. A worker can therefore make its own request look younger than
 * it is, which costs it the front of the stack, and can never make it look
 * older. Nanoseconds because APFS keeps them and two files written back to back
 * differ by about 170 microseconds.
 *
 * A coarse clock stamps both files the same. tmpfs does this: two writes in
 * one poll share a ctime, and `readdir` then comes back in name order, which
 * is the forgery the paragraph above is about. The inode breaks that tie.
 * The kernel assigns it, a later create in a fresh directory gets a higher
 * one, and a worker cannot move it backwards. Equal inode and equal ctime
 * keep the order we already had.
 */
function bornAt(dir, name) {
  try {
    const st = fs.lstatSync(path.join(dir, name), { bigint: true });
    return { ctime: st.ctimeNs, ino: st.ino };
  } catch { return { ctime: 2n ** 63n, ino: 2n ** 63n }; } // gone or unreadable: never in front of something real
}

export function listPending(storeRoot, { now = Date.now } = {}) {
  const dir = spoolDir(storeRoot);
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return []; }
  const at = now();
  // NUL cannot occur in a path or a filename, so two spools never collide.
  const prefix = `${dir}\0`;
  const names = files.filter((f) => f.endsWith(REQUEST_SUFFIX));
  // Everything new in this pass takes its place in the queue before anything is
  // read, oldest first, so the order does not depend on what `readdir` felt
  // like returning.
  for (const { f } of names
    .filter((f) => !seenAt.has(prefix + f.slice(0, -REQUEST_SUFFIX.length)))
    .map((f) => ({ f, born: bornAt(dir, f) }))
    .sort((a, b) => (a.born.ctime < b.born.ctime ? -1 : a.born.ctime > b.born.ctime ? 1
      : a.born.ino < b.born.ino ? -1 : a.born.ino > b.born.ino ? 1 : 0))) {
    seenAt.set(prefix + f.slice(0, -REQUEST_SUFFIX.length), { at, seq: sightings += 1 });
  }
  const present = new Set();
  const pending = [];
  for (const f of names) {
    const id = f.slice(0, -REQUEST_SUFFIX.length);
    const key = prefix + id;
    const seen = seenAt.get(key);
    // A REQUEST NOBODY IS WAITING ON ANY MORE. Nothing ever removed one whose
    // process was gone, which is what made a forged `at: 0` mean permanently.
    if (at - seen.at > REQUEST_TTL_MS) {
      console.warn(`zero: approval ${id} outlasted every deadline that could have answered it; it has been taken out of the spool`);
      removeSpoolEntry(dir, f);
      removeSpoolEntry(dir, `${id}.answer.json`);
      continue;
    }
    present.add(key);
    // A DECIDED CARD IS HIDDEN WHILE THE ENGINE REAPS IT -- BUT ONLY IF THE
    // DECISION IS HERS. This was a bare `files.includes(...)`, and that made
    // any answer file a way to take a card off her screen: a worker rewriting
    // a forgery once a second keeps ANY card, its own or another worker's,
    // hidden until the fifteen-minute deadline denies it in silence. So the
    // file is checked, and one that is not hers is removed rather than
    // believed -- the same sweep main/codex-approvals.mjs already runs, moved
    // to where both engines pass through it.
    const answerName = `${id}.answer.json`;
    if (files.includes(answerName)) {
      if (answerIsHers(id, readSpoolJson(dir, answerName))) continue;
      console.warn(`zero: an answer file appeared for approval ${id} that the founder did not write; it has been deleted and the card is still waiting`);
      removeSpoolEntry(dir, answerName);
    }
    const request = readSpoolJson(dir, f);
    // AND WHAT WAS HANDED OUT IS REMEMBERED, because this is the only place a
    // request is ever read and every caller of this function acts on or draws
    // exactly what it returns. `answer` signs THIS, so her press authorises the
    // card that was on the screen rather than whatever is filed under the id by
    // the time somebody honours it. Kept from the last SUCCESSFUL read: a file
    // that has gone unreadable takes its card off her screen too, so leaving
    // the digest alone is leaving the last thing she was actually shown.
    if (request) {
      seen.card = cardDigest(request);
      pending.push({ request, seq: seen.seq });
    }
  }
  for (const key of seenAt.keys()) if (key.startsWith(prefix) && !present.has(key)) seenAt.delete(key);
  return pending.sort((a, b) => a.seq - b.seq).map((p) => p.request);
}

/**
 * The digest of the card last put in front of her for this request, or null
 *  when nothing ever was. Kept beside the sighting, so it lives exactly as long
 *  as the request file does. */
export function cardShown(storeRoot, id) {
  return seenAt.get(`${spoolDir(storeRoot)}\0${id}`)?.card ?? null;
}

export function answer(storeRoot, id, allow, note) {
  if (!/^[\w-]+$/.test(String(id ?? ''))) return false;
  const dir = spoolDir(storeRoot);
  if (!spoolEntryExists(dir, `${id}.request.json`)) return false;
  // A DECISION THAT NAMES NO ACTION IS NOT A DECISION. Every route that answers
  // a card reads `listPending` immediately before it -- the snapshot the card is
  // drawn from, the ⌘Y/⌘N chord, the Agents menu -- so in the app there is
  // always a card here. Reading the file instead would be signing something she
  // may never have seen, which is the hole this whole section is about.
  const card = cardShown(storeRoot, id);
  if (!card) return false;
  const at = Date.now();
  // SIGNED, so the process waiting on it can tell her decision from one a
  // worker wrote, and bound to the card so it cannot be honoured against a
  // different action. See `answerIsHers` above for why nothing weaker works.
  const sig = crypto.sign(null, decisionBytes(id, !!allow, note ?? null, at, card), keys().privateKey).toString('base64');
  return writeSpoolFile(dir, `${id}.answer.json`,
    JSON.stringify({ allow: !!allow, note: note ?? null, at, card, sig }));
}
