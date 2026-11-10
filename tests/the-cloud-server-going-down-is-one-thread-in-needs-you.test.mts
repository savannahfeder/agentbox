// THE CLOUD SERVER GOING DOWN IS ONE THREAD IN NEEDS YOU.
//
// From 2026-11-04 the cloud server answered 502 to every call for more than
// two days and nothing told anyone: every Mac saw its cloud runs die
// ("agentbox cloud: stopped: the cloud server said 502: no reason") and ran
// threads here instead. The Mac that deploys the server now files one thread
// in Needs you when cloud starts keep dying on the server's own error, and a
// note on it when a cloud run starts again.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CloudServerWatch, serverError, runsACloudServer, UP_AGAIN } from '../main/cloud-server-down.mts';
import { Supervisor } from '../main/supervisor.mts';

let tmp; let home; let userDir; let repo;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-down-'));
  home = path.join(tmp, 'home');
  userDir = path.join(tmp, 'user');
  repo = path.join(tmp, 'repo');
  fs.mkdirSync(path.join(home, '.agentbox'), { recursive: true });
  fs.mkdirSync(userDir, { recursive: true });
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'scripts', 'cloud-gateway-setup.mjs'), '');
});

const operator = () => fs.writeFileSync(path.join(home, '.agentbox', 'cloud.own-aws.json'), JSON.stringify({ region: 'us-east-1', bucket: 'b', runtimeArn: 'r' }));
function fakeStore(products = [{ slug: 'app', repoPath: null }, { slug: 'agentbox', repoPath: repo }]) {
  const filed = []; const notes = [];
  return {
    filed, notes,
    listProducts: () => products,
    fileItem(slug, row) { filed.push({ slug, ...row }); return { id: `w-${filed.length}` }; },
    noteItem(product, id, text) { notes.push({ product, id, text }); },
  };
}
const line = (s) => `stderr: agentbox cloud: ${s}`;

describe('what counts as the cloud server itself erroring', () => {
  it('is a 5xx the server answered, and the last one said', () => {
    expect(serverError([line('stopped: the cloud server said 502: no reason')])).toBe('stopped: the cloud server said 502: no reason');
    expect(serverError([line('stopped: the cloud server said 500: x'), line('stopped: the cloud server said 503: y')])).toBe('stopped: the cloud server said 503: y');
  });

  it('is not a 4xx, another start failure, or the words outside our own line', () => {
    expect(serverError([line('stopped: the cloud server said 401: sign in again')])).toBeNull();
    expect(serverError([line('could not pack the folder')])).toBeNull();
    expect(serverError(['stdout: the agent wrote "the cloud server said 502"'])).toBeNull();
    expect(serverError(null)).toBeNull();
  });
});

describe('which Mac says so', () => {
  it('is one with the server\'s AWS bucket and runtime, not one that only knows its address', () => {
    expect(runsACloudServer(home)).toBe(false);
    fs.writeFileSync(path.join(home, '.agentbox', 'cloud.json'), JSON.stringify({ gateway: 'https://x' }));
    expect(runsACloudServer(home)).toBe(false);
    operator();
    expect(runsACloudServer(home)).toBe(true);
  });
});

describe('the thread', () => {
  it('is filed once per outage, in the project that holds the server, and noted when it is back', () => {
    operator();
    const store = fakeStore();
    const watch = new CloudServerWatch({ store, userDir, home });
    expect(watch.down('stopped: the cloud server said 502: no reason', 3)).toBe('w-1');
    expect(store.filed).toHaveLength(1);
    expect(store.filed[0].slug).toBe('agentbox');
    expect(store.filed[0].title).toMatch(/cloud server is down/);
    expect(store.filed[0].body).toContain('the cloud server said 502');
    expect(store.filed[0].kind).toBe('review');
    // Still down, and the app restarted: no second thread.
    expect(new CloudServerWatch({ store, userDir, home }).down('stopped: the cloud server said 502: no reason', 6)).toBeNull();
    expect(store.filed).toHaveLength(1);
    watch.up();
    expect(store.notes).toEqual([{ product: 'agentbox', id: 'w-1', text: UP_AGAIN }]);
    watch.up();
    expect(store.notes).toHaveLength(1);
    // The next outage is a new thread.
    expect(watch.down('stopped: the cloud server said 503: x', 3)).toBe('w-2');
  });

  it('is not filed on a Mac that does not run the server, or with no project holding its code', () => {
    const store = fakeStore();
    expect(new CloudServerWatch({ store, userDir, home }).down('stopped: the cloud server said 502', 3)).toBeNull();
    operator();
    const elsewhere = fakeStore([{ slug: 'app', repoPath: path.join(tmp, 'nothing') }]);
    expect(new CloudServerWatch({ store: elsewhere, userDir, home }).down('stopped: the cloud server said 502', 3)).toBeNull();
    expect(store.filed).toHaveLength(0);
    expect(elsewhere.filed).toHaveLength(0);
  });
});

describe('the app', () => {
  function supervisor() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-down-app-'));
    const s = new Supervisor({ storeRoot: root, home: root, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [], isDue: () => true }, root, root, root);
    const calls = [];
    s.cloudServerWatch = { down: (said, n) => calls.push(['down', said, n]), up: () => calls.push(['up']) };
    return { s, calls };
  }
  const failed = (said) => ({ cloud: true, itemId: 'w-9', sessionId: null, result: null, tail: [line(said)] });

  it('says the server is down once enough cloud starts in a row died on its error', () => {
    const { s, calls } = supervisor();
    s._noteCloudOutcome(failed('stopped: the cloud server said 502: no reason'), 75);
    s._noteCloudOutcome(failed('stopped: the cloud server said 502: no reason'), 75);
    expect(calls).toEqual([]);
    s._noteCloudOutcome(failed('stopped: the cloud server said 502: no reason'), 75);
    expect(calls).toEqual([['down', 'stopped: the cloud server said 502: no reason', 3]]);
  });

  it('does not for starts that died some other way', () => {
    const { s, calls } = supervisor();
    for (let i = 0; i < 4; i += 1) s._noteCloudOutcome(failed('could not pack the folder'), 75);
    expect(calls).toEqual([]);
  });

  it('says it is back when a cloud run starts its agent', () => {
    const { s, calls } = supervisor();
    s._noteCloudOutcome({ cloud: true, itemId: 'w-9', sessionId: 'abc', result: null, tail: [] }, 0);
    expect(calls).toEqual([['up']]);
  });
});
