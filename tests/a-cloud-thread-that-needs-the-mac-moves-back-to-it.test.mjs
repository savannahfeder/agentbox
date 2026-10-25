// A CLOUD THREAD THAT NEEDS THIS MAC MOVES BACK TO IT ON ITS OWN.
//
// What broke (2026-10-16): with the cloud set to Everything, the launch-video
// thread's reply ran in the cloud and answered "I can't change the film from
// here: this session is on a cloud machine without the film's files or the
// video key", then offered to "move this task back to your Mac", which nothing
// in the app could do. Measured off that run's transcript: the film's working
// folder was missing (the thread's designs folder is 18 GB; a cloud run gets
// at most 50 MB of it), `which ffmpeg` printed nothing, and the key file under
// the home folder was absent. She read it as the cloud failing again.
//
// Now a cloud run is told what the cloud machine has. When a request needs
// anything else it ends on one marked line instead of an answer; the app keeps
// that thread on this Mac, writes nothing on the row, and runs the same
// request again here, telling the agent why.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { HAND_BACK, handsBack } from '../shared/cloud-hand-back.mjs';
import { argvForTheCloud, CLOUD_NOTE } from '../main/cloud/run.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hand-back-')); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

describe('what a cloud run is told', () => {
  it('rides after the app\'s own instructions, and names the marked line', () => {
    const out = argvForTheCloud(['-p', '--append-system-prompt', 'HER RULES', '--model', 'opus']);
    expect(out.slice(0, 2)).toEqual(['-p', '--append-system-prompt']);
    expect(out[2].startsWith('HER RULES\n\n')).toBe(true);
    expect(out[2]).toContain(CLOUD_NOTE);
    expect(out.slice(3)).toEqual(['--model', 'opus']);
    expect(CLOUD_NOTE).toContain(HAND_BACK);
    // It says what is missing, by the things that were missing that day.
    // A program is installed there, not a reason to move (2026-10-17); a key is.
    for (const word of ['sudo', 'key', '50 MB']) expect(CLOUD_NOTE).toContain(word);
    expect(CLOUD_NOTE).toMatch(/A program you can install is not a reason to stop/);
  });

  it('is added when the run had no instructions of its own', () => {
    expect(argvForTheCloud(['-p'])).toEqual(['-p', '--append-system-prompt', CLOUD_NOTE]);
  });
});

describe('the marked line', () => {
  it('is read on a line of its own, wherever it is in the reply', () => {
    expect(handsBack(`${HAND_BACK} the film's files and ffmpeg`)).toBe(true);
    expect(handsBack(`Checking.\n${HAND_BACK} the key file`)).toBe(true);
  });
  it('is not read from a reply that only talks about the Mac, or quotes the line', () => {
    expect(handsBack("I can't change the film from here. Move this task back to your Mac.")).toBe(false);
    expect(handsBack(`The cloud note says to write "${HAND_BACK}" when stuck.`)).toBe(false);
    expect(handsBack(null)).toBe(false);
  });
});

const product = { slug: 'p', dir: '', repoPath: '/r' };
const make = (root) => {
  product.dir = root;
  const written = [];
  const store = {
    listItems: () => [], listProducts: () => [product], isDue: () => true,
    readItem: () => ({ id: 'w-a', status: 'open', wrote: {} }),
    recordSessionResult: (...a) => written.push(a),
    settleAnswer() {}, releaseRunClaim() {},
  };
  const sup = new Supervisor({ storeRoot: root, home: root, maxConcurrentSessions: 3 }, store, root);
  sup.storeMcpCommand = () => '/fake/store';
  return { sup, written };
};

describe('a cloud run that ends on the marked line', () => {
  const ended = () => ({ itemId: 'w-a', product: 'p', cloud: true, startedAt: Date.now() - 60_000, result: `${HAND_BACK} the film's files`, resultIsError: false });

  it('keeps the thread on this Mac, writes nothing on the row, and runs the reply again', () => {
    const { sup } = make(tmp());
    const session = ended();
    expect(sup._noteCloudHandBack({ id: 'w-a', product: 'p' }, session)).toBe(true);
    expect(sup._cloudEligible({ id: 'w-a', product: 'p' })).toBe(false);
    expect(sup.closingMessageIsTheAnswer(session)).toBe(false);
    expect(sup.speaksForTheSession(session)).toBe(false);
    expect(sup.settleDelivery({ id: 'w-a', product: 'p' }, 'please do it', session, null)).toBe('interrupted');
  });

  // What it is told, and that only a run here is told it, is in
  // tests/a-cloud-run-is-never-told-it-is-on-the-computer.
  it('tells the agent on the Mac why it is there, once', () => {
    const { sup } = make(tmp());
    sup._noteCloudHandBack({ id: 'w-a', product: 'p' }, ended());
    expect(sup._toldItMoved({ id: 'w-a' }, 'local')).toBe(true);
    expect(sup._toldItMoved({ id: 'w-a' }, 'local')).toBe(false);
  });

  it('on this Mac, or with an ordinary answer, changes nothing', () => {
    const { sup } = make(tmp());
    expect(sup._noteCloudHandBack({ id: 'w-a', product: 'p' }, { ...ended(), cloud: false })).toBe(false);
    expect(sup._noteCloudHandBack({ id: 'w-a', product: 'p' }, { ...ended(), result: 'Done: the film is cut.' })).toBe(false);
    expect(sup._cloudEligible({ id: 'w-a', product: 'p' })).toBe(true);
  });

  it('is checked before anything writes the run\'s answer on the row', () => {
    const src = read('main/supervisor.mjs');
    const at = src.indexOf('this._noteCloudHandBack(item, session)');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(src.indexOf('if (this.speaksForTheSession(session, { command: !!plan.command }))'));
  });
});

// Since 2026-10-17 such a thread goes to the cloud with its newest designs
// (tests/a-thread-with-big-designs-goes-to-the-cloud-and-nothing-left-behind-
// is-overwritten): her Mac was overloaded by the threads this check kept on
// it. One that needs the rest hands itself back, as above.
describe('a thread whose own designs are too big to go whole', () => {
  it('may still go to the cloud', () => {
    const root = tmp();
    const { sup } = make(root);
    const d = path.join(root, 'designs', 'w-a');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'film.mp4'), Buffer.alloc(26 * 1024 * 1024));
    expect(sup._cloudEligible({ id: 'w-a', product: 'p' })).toBe(true);
    expect(sup._mayRunInCloud({ id: 'w-a' }, product, '/r/.claude/worktrees/w-a')).toBe(true);
  });
});
