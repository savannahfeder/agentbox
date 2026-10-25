// THE OTHER END OF main/freeze-recorder.mjs: the watcher, on its own thread.
//
// The profile is rotated every `rotateMs` so it never grows, and at the end of
// each freeze so the freeze is in the one it hands back. The one before is
// kept too, because a freeze can start before a rotation and end after it.
import { Session } from 'node:inspector';
import { parentPort, workerData } from 'node:worker_threads';
import { freezeFrom, writeFreeze } from './freeze-recorder.mjs';

const { beat, dir, appDir, thresholdMs, rotateMs, intervalUs } = workerData;
const stamp = new BigInt64Array(beat);
const nowUs = () => Number(process.hrtime.bigint() / 1000n);
// The main thread asleep rather than stuck (App Nap timers, say) has an idle
// profile. Below this share of busy samples it is not a freeze.
const BUSY_ENOUGH = 0.5;

const session = new Session();
const post = (method, params = {}) => new Promise((resolve, reject) => {
  session.post(method, params, (err, out) => (err ? reject(err) : resolve(out)));
});

let running = null;  // { anchorUs } of the profile being taken
let previous = null; // { profile, offsetUs } of the last one stopped
let frozeAt = null;  // the last stamp before the freeze in progress, in µs
const seen = [];     // freezes ended and not yet cut out of a profile
let busy = false;

async function start() {
  const before = nowUs();
  await post('Profiler.start');
  running = { anchorUs: (before + nowUs()) / 2 };
}

async function rotate() {
  const { profile } = await post('Profiler.stop');
  const stopped = { profile, offsetUs: profile.startTime - running.anchorUs };
  await start();
  const profiles = [previous, stopped].filter(Boolean);
  previous = stopped;
  for (const f of seen.splice(0)) {
    const read = freezeFrom(profiles, { fromUs: f.fromUs, toUs: f.toUs, appDir });
    if (read.busy < BUSY_ENOUGH) continue;
    const line = { at: new Date(Date.now() - (nowUs() - f.fromUs) / 1000).toISOString(), ms: Math.round((f.toUs - f.fromUs) / 1000), ...read };
    writeFreeze(dir, line);
    parentPort.postMessage({ freeze: { at: line.at, ms: line.ms, where: line.where } });
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

function watch() {
  const last = Number(Atomics.load(stamp, 0) / 1000n);
  if (nowUs() - last > thresholdMs * 1000) { frozeAt ??= last; return; }
  if (frozeAt === null) return;
  seen.push({ fromUs: frozeAt, toUs: last });
  frozeAt = null;
  void turn();
}

let watching = null;
let rotating = null;
function quit(err) {
  clearInterval(watching);
  clearInterval(rotating);
  try { session.disconnect(); } catch { /* already gone */ }
  parentPort.postMessage({ gaveUp: String(err?.message ?? err) });
}

// The timers go first: an inspector reply does not keep this thread alive.
watching = setInterval(watch, 50);
rotating = setInterval(() => { if (frozeAt === null) void turn(); }, rotateMs);
try {
  session.connectToMainThread();
  await post('Profiler.enable');
  await post('Profiler.setSamplingInterval', { interval: intervalUs });
  await start();
} catch (err) {
  quit(err);
}
