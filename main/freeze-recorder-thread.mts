// THE OTHER END OF main/freeze-recorder.mts: the watcher, on its own thread.
//
// The profile is rotated every `rotateMs` so it never grows, and at the end of
// each freeze so the freeze is in the one it hands back. The one before is
// kept too, because a freeze can start before a rotation and end after it.
import { Session } from 'node:inspector';
import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { busyFrom, freezeFrom, writeBusy, writeFreeze, CPU_ASK } from './freeze-recorder.mts';
import type { CpuProfile, FreezeLine } from './freeze-recorder.mts';

interface FreezeWorkerData {
  beat: SharedArrayBuffer;
  dir: string;
  appDir: string[];
  thresholdMs: number;
  rotateMs: number;
  intervalUs: number;
}

interface StoppedProfile {
  profile: CpuProfile;
  offsetUs: number;
}

const { beat, dir, appDir, thresholdMs, rotateMs, intervalUs }: FreezeWorkerData = workerData;
const stamp = new BigInt64Array(beat);
const nowUs = () => Number(process.hrtime.bigint() / 1000n);
// The main thread asleep rather than stuck (App Nap timers, say) has an idle
// profile. Below this share of busy samples it is not a freeze.
const BUSY_ENOUGH = 0.5;

const session = new Session();
const post = <T extends object = object>(method: string, params: object = {}) => new Promise<T>((resolve, reject) => {
  session.post(method, params, (err, out) => (err ? reject(err) : resolve(out as T)));
});

let running: { anchorUs: number } | null = null;  // { anchorUs } of the profile being taken
let previous: StoppedProfile | null = null; // { profile, offsetUs } of the last one stopped
const seen: { fromUs: number; toUs: number }[] = [];     // freezes ended and not yet cut out of a profile
let busy = false;

// WHAT THE THREAD IS BUSY WITH WHEN IT IS NOT STUCK: the stretch just profiled,
// written every quarter of an hour and whenever the ask file is there, so a
// thread busy all day in pieces too short to be a freeze can be read too.
const CPU_EVERY_MS = 15 * 60_000;
const ASKED_KEEPS = 60;
let cpuAt = Date.now();
function noteBusy(profiles: StoppedProfile[]) {
  try {
    const ask = path.join(dir, CPU_ASK);
    const asked = fs.existsSync(ask);
    if (!asked && Date.now() - cpuAt < CPU_EVERY_MS) return;
    // An ask may name a function on its first line, and is answered at more length than the quarter-hour line.
    let under = '';
    if (asked) try { under = fs.readFileSync(ask, 'utf8').split('\n')[0]!.trim().slice(0, 120); } catch { /* an ask of nothing */ }
    const read = busyFrom(profiles, asked ? { appDir, keep: ASKED_KEEPS, under } : { appDir });
    // A turn right after a start or a freeze covers a moment: wait for a fuller one.
    if (read.ms < rotateMs / 2) return;
    cpuAt = Date.now();
    // The ask goes first, so a line that cannot be written is not tried every turn.
    if (asked) fs.rmSync(ask, { force: true });
    writeBusy(dir, { at: new Date().toISOString(), ...read });
  } catch { /* the freeze log matters more than this line */ }
}

// A profile starting while none runs walks the whole heap on the main thread
// (625 ms at 900 MB), so the next one always starts before the last ends.
// Only console profiles nest; Profiler.start does not.
let title = '';
let count = 0;
const finished = new Map<string, (profile: CpuProfile) => void>();
session.on('Profiler.consoleProfileFinished', ({ params }) => {
  const { title: done, profile } = params as { title: string; profile: CpuProfile };
  finished.get(done)?.(profile);
  finished.delete(done);
});
const consoleCall = (call: string, of: string) => post('Runtime.evaluate', { expression: `console.${call}(${JSON.stringify(of)})`, silent: true });
const END_WAIT_MS = 10_000;

async function start() {
  title = `freeze-recorder-${(count += 1)}`;
  const before = nowUs();
  await consoleCall('profile', title);
  running = { anchorUs: (before + nowUs()) / 2 };
}

async function end(of: string) {
  const profile = new Promise<CpuProfile>((resolve, reject) => {
    const timer = setTimeout(() => { finished.delete(of); reject(new Error(`the profile ${of} never came back`)); }, END_WAIT_MS);
    finished.set(of, (p) => { clearTimeout(timer); resolve(p); });
  });
  await consoleCall('profileEnd', of);
  return profile;
}

async function rotate() {
  const [old, anchorUs] = [title, running!.anchorUs];
  await start();
  const profile = await end(old);
  const stopped: StoppedProfile = { profile, offsetUs: profile.startTime - anchorUs };
  const profiles = [previous, stopped].filter(Boolean) as StoppedProfile[];
  previous = stopped;
  noteBusy(profiles);
  for (const f of seen.splice(0)) {
    const read = freezeFrom(profiles, { fromUs: f.fromUs, toUs: f.toUs, appDir });
    if (read.busy < BUSY_ENOUGH) continue;
    const line: FreezeLine = { at: new Date(Date.now() - (nowUs() - f.fromUs) / 1000).toISOString(), ms: Math.round((f.toUs - f.fromUs) / 1000), ...read };
    writeFreeze(dir, line);
    parentPort!.postMessage({ freeze: { at: line.at, ms: line.ms, where: line.where } });
  }
}

// A freeze that ends while a rotation is under way goes round again.
async function turn() {
  if (busy || !running) return;
  busy = true;
  try {
    do { await rotate(); } while (seen.length);
  } catch (err) { quit(err); } finally { busy = false; }
}

// The main thread's first beat after a hold says so.
function held({ fromUs, toUs }: { fromUs: number; toUs: number }) {
  // On waking, the beat and the wake can come in either order: still asleep
  // covers the beat first, a wake since the hold began covers the wake first.
  const slept = Atomics.load(stamp, 1) !== 0n || Number(Atomics.load(stamp, 2) / 1000n) >= fromUs;
  if (!slept) seen.push({ fromUs, toUs });
  void turn();
}
const holding = () => nowUs() - Number(Atomics.load(stamp, 0) / 1000n) > thresholdMs * 1000;

let rotating: NodeJS.Timeout | null = null;
function quit(err: unknown) {
  clearInterval(rotating!);
  try { session.disconnect(); } catch { /* already gone */ }
  parentPort!.postMessage({ gaveUp: String((err as Error | null)?.message ?? err) });
}

// These go first: an inspector reply does not keep this thread alive.
parentPort!.on('message', (m: { hold?: { fromUs: number; toUs: number } } | null) => { if (m?.hold) held(m.hold); });
rotating = setInterval(() => { if (!holding()) void turn(); }, rotateMs);
try {
  session.connectToMainThread();
  await post('Profiler.enable');
  await post('Profiler.setSamplingInterval', { interval: intervalUs });
  await start();
} catch (err) {
  quit(err);
}
