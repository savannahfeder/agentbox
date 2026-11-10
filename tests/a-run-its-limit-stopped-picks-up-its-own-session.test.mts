// A RUN ITS LIMIT STOPPED PICKS UP ITS OWN SESSION WHEN THE LIMIT RESETS.
//
// A tester on Claude Pro ran a research task that set seven helpers going. The
// plan's limit stopped it three times, and every time it reset the task started
// over: the setup steps again, all seven helpers again, the limit again. The
// run's session was kept (`_liveSessions`), but only the wake sweep resumes
// one, and only after a restart or a sleep. Otherwise the fresh-work pass
// picked the row up when the account was back and `spawnPlan` briefed a new
// session from the task. Measured on `spawnPlan` after a limit death: no
// --resume, the whole brief again.
//
// Now a run its account stopped after it had started work is marked, and the
// next start of that row goes back to the same session, told why it stopped.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';

const LIMIT = "You've hit your session limit · resets 6:50pm";
let tmp;

function putTranscript(cwd, sessionId) {
  const dir = path.join(os.homedir(), '.claude', 'projects', String(cwd).replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), '{}\n');
}

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'zero-limit-resume-')));
  vi.spyOn(os, 'homedir').mockReturnValue(tmp);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const productDir = () => path.join(tmp, 'research');
const product = () => ({ slug: 'research', name: 'Research', dir: productDir() });
const item = { id: 'w-1', product: 'research', title: 'Batch 8 research', body: 'Find leads.', status: 'open', labels: ['founder'] };

function makeSupervisor() {
  const store = { listItems: () => [item], listProducts: () => [product()], isDue: () => true };
  const sup = new Supervisor({ storeRoot: tmp, authProfiles: ['default'] }, store, tmp);
  sup._saveState = () => {};
  return sup;
}

// A run as the exit handler sees it, after its agent said its id.
function endRun(sup, { result = LIMIT, usedATool = true, resumed = false, cloud = false, id = 'sess-1' } = {}) {
  sup._liveSessions[item.id] = { sessionId: id, product: item.product, cwd: productDir(), profile: 'default', engine: 'claude', startedAt: Date.now() - 900_000, ...(cloud ? { cloud: true } : {}) };
  const session = {
    itemId: item.id, product: item.product, profile: 'default', engine: 'claude', sessionId: id,
    startedAt: Date.now() - 900_000, tail: [], result, resultIsError: true, usedATool, resumed, ...(cloud ? { cloud: true } : {}),
  };
  sup.noteExitForBackoff(session);
  sup._noteStoppedByAccount(item, session);
  return session;
}

const resumedId = (plan) => (plan.args.includes('--resume') ? plan.args[plan.args.indexOf('--resume') + 1] : null);

describe('a run its limit stopped partway', () => {
  it('starts again in the same session, not as a new one', () => {
    const sup = makeSupervisor();
    putTranscript(productDir(), 'sess-1');
    endRun(sup);
    const plan = sup.spawnPlan(item, product());
    expect(resumedId(plan)).toBe('sess-1');
  });

  it('is told the limit stopped it and to check its helpers, not that the machine slept', () => {
    const sup = makeSupervisor();
    putTranscript(productDir(), 'sess-1');
    endRun(sup);
    const { prompt } = sup.spawnPlan(item, product());
    expect(prompt).toMatch(/usage limit/);
    expect(prompt).toMatch(/helpers/);
    expect(prompt).not.toMatch(/machine slept/);
    expect(prompt).not.toContain('Find leads.');
  });

  it('a resumed run the limit stopped again on arrival keeps its session too', () => {
    const sup = makeSupervisor();
    putTranscript(productDir(), 'sess-1');
    endRun(sup, { usedATool: false, resumed: true });
    expect(resumedId(sup.spawnPlan(item, product()))).toBe('sess-1');
  });

  it('a run signed out partway goes back to its session the same way', () => {
    const sup = makeSupervisor();
    putTranscript(productDir(), 'sess-1');
    endRun(sup, { result: 'Failed to authenticate: OAuth session expired and could not be refreshed' });
    const plan = sup.spawnPlan(item, product());
    expect(resumedId(plan)).toBe('sess-1');
    expect(plan.prompt).not.toMatch(/usage limit/);
  });
});

describe('and the runs that start fresh, as before', () => {
  it('a run the limit stopped before it did anything', () => {
    const sup = makeSupervisor();
    putTranscript(productDir(), 'sess-1');
    endRun(sup, { usedATool: false });
    const plan = sup.spawnPlan(item, product());
    expect(resumedId(plan)).toBe(null);
    expect(plan.prompt).toContain('Find leads.');
  });

  it('a run that died of something that was not its account', () => {
    const sup = makeSupervisor();
    putTranscript(productDir(), 'sess-1');
    endRun(sup, { result: 'something nobody has seen before' });
    expect(resumedId(sup.spawnPlan(item, product()))).toBe(null);
  });

  it('a run whose session is not on this computer, rather than resuming nothing', () => {
    const sup = makeSupervisor();
    endRun(sup);
    expect(resumedId(sup.spawnPlan(item, product()))).toBe(null);
  });

  it('a cloud run, whose limit the cloud handles', () => {
    const sup = makeSupervisor();
    putTranscript(productDir(), 'sess-1');
    endRun(sup, { cloud: true });
    expect(resumedId(sup.spawnPlan(item, product()))).toBe(null);
  });

  it('once a later run of the row has got going', () => {
    const sup = makeSupervisor();
    putTranscript(productDir(), 'sess-1');
    endRun(sup);
    sup._stoppedSessionTakenUp(item, { sessionId: 'sess-2' });
    expect(resumedId(sup.spawnPlan(item, product()))).toBe(null);
  });

  it('a session from a folder the row no longer works in', () => {
    const sup = makeSupervisor();
    putTranscript(productDir(), 'sess-1');
    endRun(sup);
    const moved = { ...product(), dir: path.join(tmp, 'research-moved') };
    expect(resumedId(sup.spawnPlan(item, moved))).toBe(null);
  });

  it('a row that was closed in the meantime forgets it', () => {
    const sup = makeSupervisor();
    putTranscript(productDir(), 'sess-1');
    endRun(sup);
    sup.store.listItems = () => [{ ...item, status: 'done' }];
    sup.recoverInterrupted('startup');
    expect(sup._stoppedSessions[item.id]).toBeUndefined();
  });
});

describe('what does not lose it', () => {
  it('a command typed on the row, which resumes the session only to print a table', () => {
    const sup = makeSupervisor();
    putTranscript(productDir(), 'sess-1');
    endRun(sup);
    sup._stoppedSessionTakenUp(item, { sessionId: 'sess-1', command: true });
    // Its finish forgets the wreckage record, as any clean finish does.
    delete sup._liveSessions[item.id];
    expect(resumedId(sup.spawnPlan(item, product()))).toBe('sess-1');
  });

  it('a cloud start that left nothing, which rewrites and then drops the wreckage record', () => {
    const sup = makeSupervisor();
    putTranscript(productDir(), 'sess-1');
    endRun(sup);
    sup._liveSessions[item.id] = { sessionId: null, product: item.product, cwd: productDir(), profile: 'default', engine: 'claude', cloud: true };
    delete sup._liveSessions[item.id];
    expect(resumedId(sup.spawnPlan(item, product()))).toBe('sess-1');
  });

  it('a restart of the app', () => {
    const sup = makeSupervisor();
    putTranscript(productDir(), 'sess-1');
    sup._saveState = Supervisor.prototype._saveState;
    endRun(sup);
    const again = new Supervisor({ storeRoot: tmp, authProfiles: ['default'] }, sup.store, tmp);
    expect(resumedId(again.spawnPlan(item, product()))).toBe('sess-1');
  });
});

describe('where the run marks and clears it', () => {
  const src = fs.readFileSync(new URL('../main/supervisor.mts', import.meta.url), 'utf8');
  it('marks it right after its account is judged', () => {
    expect(src).toMatch(/this\.noteExitForBackoff\(session, \{ onLine \}\);\s*\n\s*this\._noteStoppedByAccount\(item, session\);/);
  });
  it('clears it the moment a run of the row says its session', () => {
    expect(src).toMatch(/this\.rememberRowSession\(item, [^\n]*\);\s*\n\s*this\._stoppedSessionTakenUp\(item, session\);/);
  });
});
