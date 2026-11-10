// THREADS STUCK ON ONE CAUSE WAIT BEHIND ONE ROW (w-bb45118b10).
//
// On 2026-11-08 ten threads came back to Needs you at once with three causes
// between them: six asked the person to sign git in to GitHub on their Mac,
// two to give cloud runs a GitHub sign-in, two to open the Mac for the cloud.
// Each was its own row and each had to be answered on its own. Measured off
// the store that day: 14 rows in Needs you, 10 of them from those 3 causes.
//
// Now a stuck thread calls wait_on_cause. The first to hit a cause opens one
// row for it, which the app starts on its own (its agent is the lead); the rest
// join that row and leave Needs you for Later. When the lead closes the row,
// every thread behind it carries on, whichever project it is in.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isCause, causeOf, keeperOf, waitingOn, causeWord, causeWhere, openCauses, cameBack, leadBrief, withoutBrief, CAUSE_KIND, CAUSE_LABEL, CAUSE_WAIT_WORD, CAUSE_BACK_WORDS } from '../shared/causes.mts';
import { filedByThePerson } from '../shared/answers.mts';
import { Supervisor } from '../main/supervisor.mts';

const T = 1_794_000_000_000;
const DAY = 86_400_000;
const cause = (id, over = {}) => ({ id, product: 'agentbox', kind: CAUSE_KIND, labels: ['founder', CAUSE_LABEL], status: 'open', title: "Your Mac can't push to GitHub", wrote: { kind: { source: 'system' } }, ...over });
const stuck = (id, on, over = {}) => ({ id, product: 'agentbox', status: 'blocked', blockedBy: [on], wrote: { status: { ts: T, source: 'agent' }, blockedBy: { ts: T, source: 'agent' } }, ...over });

describe('what counts as a cause row', () => {
  it('a row the app filed with the kind and the label', () => {
    expect(isCause(cause('c1'))).toBe(true);
  });
  it('not one an agent wrote the kind on itself', () => {
    expect(isCause(cause('c1', { wrote: { kind: { source: 'agent' } } }))).toBe(false);
  });
  it('not a row with the label alone, or the kind alone', () => {
    expect(isCause(cause('c1', { labels: ['founder'] }))).toBe(false);
    expect(isCause(cause('c1', { kind: 'task' }))).toBe(false);
  });
});

describe('the row says how many wait and where they are', () => {
  const all = [cause('c1'), stuck('a', 'c1'), stuck('b', 'c1', { product: 'website' }), stuck('c', 'c1', { status: 'done' }), stuck('d', 'other')];

  it('counts the open threads behind it, from every project, and no others', () => {
    expect(waitingOn(all[0], all).map((i) => i.id)).toEqual(['a', 'b']);
    expect(causeWord(2)).toBe('2 waiting');
  });
  it('says All projects when they span more than one', () => {
    expect(causeWhere(all[0], waitingOn(all[0], all), 'Agentbox')).toBe('All projects');
  });
  it('says its own project when they are all in it', () => {
    expect(causeWhere(all[0], [all[1]], 'Agentbox')).toBe('Agentbox');
  });
  it('lists only open causes, newest first', () => {
    const rows = [cause('old', { createdAt: 1 }), cause('new', { createdAt: 2 }), cause('shut', { status: 'done' })];
    expect(openCauses(rows).map((i) => i.id)).toEqual(['new', 'old']);
  });
});

// The first Codex power test (2026-11-09): both testers found the threads
// behind a cause in Later saying "Scheduled" with an empty Back column, and
// had to open one to learn why it was there.
describe('a thread behind a cause says so in Later', () => {
  const all = [cause('c1'), stuck('a', 'c1'), stuck('b', 'other'), cause('c2', { status: 'done' }), stuck('d', 'c2')];
  it('finds the open cause it waits on', () => {
    expect(causeOf(all[1], all)?.id).toBe('c1');
  });
  it('not a plain thread it waits on, nor a cause already closed', () => {
    expect(causeOf(all[2], all)).toBeNull();
    expect(causeOf(all[4], all)).toBeNull();
  });
  it('is drawn as waiting, with the cause beside its name, back when fixed', () => {
    const page = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/causeOf\(item, allItems \?\? \[\]\)/);
    expect(page).toMatch(/word: CAUSE_WAIT_WORD \}\} title=\{rowTitle\(item\)\} aside=\{stuckOn\.title\}/);
    expect([CAUSE_WAIT_WORD, CAUSE_BACK_WORDS]).toEqual(['Waiting', 'When fixed']);
  });
});

// The third Codex power test (2026-11-09).
describe('what the testers found in the third run', () => {
  it('a thread the person replied to is no longer counted as waiting', () => {
    const all = [cause('c1'), stuck('a', 'c1'), stuck('b', 'c1', { status: 'open' }), stuck('c', 'c1', { status: 'claimed' })];
    expect(waitingOn(all[0], all).map((i) => i.id)).toEqual(['a']);
    expect(causeOf(all[2], all)).toBeNull();
  });

  it('a closed cause row is filed, not left in Needs you beside a new one', async () => {
    const { belongsInInbox } = await import('../renderer/src/list-rules.ts');
    const closed = cause('c1', { status: 'done', labels: ['founder', CAUSE_LABEL], answer: 'Signed in', result: 'Checked.', wrote: { kind: { source: 'system' }, status: { ts: T, source: 'agent' }, answer: { ts: T - 1, source: 'founder' } } });
    expect(belongsInInbox(closed, { now: T + 1 })).toBe(false);
    // An ordinary row an agent closed after the person spoke on it still reaches them.
    const ordinary = { ...closed, kind: 'task', labels: ['founder'] };
    expect(belongsInInbox(ordinary, { now: T + 1 })).toBe(true);
  });

  it('the board says what a thread waits on, as the list does', () => {
    const page = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/\?\? \(stuckOn \? `Waits on \$\{stuckOn\.title\}` : undefined\)/);
  });

  // The sixth Codex run: the Lines results still showed the brief, as "You".
  it('the Lines search leaves a cause row\'s brief out too, and keeps any other row\'s ask', async () => {
    const { messagesOf } = await import('../main/everything-found.mts');
    const { isCauseLedger, withoutBrief: strip } = await import('../shared/causes.mts');
    const causeLines = [
      { id: 'c1', ts: 1, source: 'system', patch: { title: 'X', kind: CAUSE_KIND, labels: ['founder', CAUSE_LABEL], body: 'You are the lead on this cause. (w-123)' } },
      { id: 'c1', ts: 2, source: 'agent', patch: { result: 'Sign in once.' } },
    ];
    const plain = [{ id: 't1', ts: 1, source: 'system', patch: { title: 'Main went red', kind: 'task', labels: ['founder'], body: 'Fix the red tests.' } }];
    expect(isCauseLedger(causeLines)).toBe(true);
    expect(isCauseLedger(plain)).toBe(false);
    expect(messagesOf(strip(causeLines)).map((m) => m.text)).toEqual(['Sign in once.']);
    expect(fs.readFileSync(new URL('../main/everything-found.mts', import.meta.url), 'utf8')).toMatch(/isCauseLedger\(loaded\.lines\) \? withoutBrief\(loaded\.lines\) : loaded\.lines/);
  });

  it('search reads what was said on a cause row, not its lead\'s brief', () => {
    expect(fs.readFileSync(new URL('../renderer/src/search.ts', import.meta.url), 'utf8')).toMatch(/const body = isCause\(i\) \? '' : searchText\(i\.body\)/);
  });

  it('the board names every project a cause\'s threads are in, as the list does', () => {
    expect(fs.readFileSync(new URL('../renderer/src/threads/page-rules.ts', import.meta.url), 'utf8')).toMatch(/project: isCause\(item\) && item\.status !== 'done' \? causeWhere\(item, waitingOn\(item, items\), product\.name\) : product\.name/);
  });

  it('the board card of a cause says how many wait, as its list row does', () => {
    const page = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/isCause\(e\.item\) && e\.item\.status !== 'done' \? \{ \.\.\.drawn, word: causeWord\(waitingOn\(e\.item, allItems \?\? \[\]\)\.length\) \}/);
  });
});

// The fourth Codex power test: two threads stuck at the same moment each
// opened a row for the same cause.
describe('two threads stuck at once keep one row', () => {
  const rows = [cause('w-b', { createdAt: 2 }), cause('w-a', { createdAt: 2 }), cause('w-c', { createdAt: 1, title: 'Main is broken' })];
  it('both keep the oldest, and on a tie the lowest id', () => {
    expect(keeperOf("your mac can't push to github", rows)?.id).toBe('w-a');
    expect(keeperOf("Your Mac can't push to GitHub", [cause('w-z', { createdAt: 1 }), ...rows])?.id).toBe('w-z');
  });
  it('a cause of another name is never the keeper', () => {
    expect(keeperOf('Cloud runs have no GitHub sign-in', rows)).toBeNull();
  });
  it('the twin that closed itself unanswered is not a cause that came back', () => {
    const twin = cause('w-b', { status: 'done', updatedAt: T - 1000 });
    expect(cameBack("Your Mac can't push to GitHub", [twin], T)).toBe(false);
    expect(cameBack("Your Mac can't push to GitHub", [{ ...twin, result: 'Checked.' }], T)).toBe(true);
  });
});

describe('a cause that comes back is fixed for good', () => {
  const closed = (at, title) => cause('c0', { status: 'done', updatedAt: at, result: 'Checked.', ...(title ? { title } : {}) });
  it('notices the same cause closed in the last two weeks', () => {
    expect(cameBack("Your Mac can't push to GitHub", [closed(T - 3 * DAY)], T)).toBe(true);
  });
  it('not one closed longer ago, nor another cause', () => {
    expect(cameBack("Your Mac can't push to GitHub", [closed(T - 15 * DAY)], T)).toBe(false);
    expect(cameBack("Your Mac can't push to GitHub", [closed(T - DAY, 'Main is broken')], T)).toBe(false);
  });
  it('and its lead is told to file the fix', () => {
    expect(leadBrief({ cause: 'x', ask: 'y', from: 'z', again: true })).toMatch(/file one thread under this row/);
    expect(leadBrief({ cause: 'x', ask: 'y', from: 'z' })).not.toMatch(/file one thread/);
  });
});

describe('a stuck thread waits on its cause through the store tool', () => {
  let product; let other; let work; let tools; let home;

  beforeEach(async () => {
    home = (await import('../main/store/home.mts')).appHome();
    // An account of its own per test, so one test's open cause is not the next one's.
    process.env.STORE_ACCOUNT_ID = `acct-causes-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    (await import('../mcp/core/account.mts')).resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    product = createProduct(`Agentbox ${Math.random().toString(36).slice(2, 8)}`);
    other = createProduct(`Website ${Math.random().toString(36).slice(2, 8)}`);
    work = await import('../mcp/core/work.mts');
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  const thread = (p, title) => work.createItem(p.id, { title, labels: ['founder'] }, { source: 'founder' });
  const call = async (ownItem, args) => {
    ({ tools } = (await import('../mcp/tools.mts')).buildTools({ holder: `test-${ownItem}`, ownItem }));
    const out = await tools.find((t) => t.name === 'wait_on_cause').run(args);
    return JSON.parse(out.content[0].text);
  };
  const read = (id) => work.listWorkItems({ includeDone: true }).find((i) => i.id === id);

  it('the first opens one row the app starts on its own, and the thread waits behind it', async () => {
    const a = thread(product, 'Who acts on comments');
    const said = await call(a.id, { cause: "Your Mac can't push to GitHub", ask: 'Run gh auth login', new: true });
    expect(said.opened).toBe(true);
    const row = read(said.waitingOn);
    expect(isCause(row)).toBe(true);
    expect(filedByThePerson(row)).toBe(true);
    expect(row.body).toMatch(/Who acts on comments/);
    expect(read(a.id)).toMatchObject({ status: 'blocked', blockedBy: [said.waitingOn] });
  });

  it('the next is shown the open causes, joins the same row, and opens no second one', async () => {
    const a = thread(product, 'Who acts on comments');
    const first = await call(a.id, { cause: "Your Mac can't push to GitHub", new: true });
    const b = thread(other, 'Local request feature UI');
    const shown = await call(b.id, { cause: 'git cannot sign in to github' });
    expect(shown.open.map((c) => c.id)).toEqual([first.waitingOn]);
    expect(shown.open[0].waiting).toBe(1);
    const joined = await call(b.id, { causeId: first.waitingOn });
    expect(joined).toMatchObject({ waitingOn: first.waitingOn, opened: false });
    expect(work.listWorkItems({ labels: [CAUSE_LABEL] })).toHaveLength(1);
    expect(waitingOn(read(first.waitingOn), work.listWorkItems({ includeDone: true })).map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
  });

  // The fourth Codex run: an app note after the lead's answer took its buttons
  // away. The fifth: with no note, the lead's list said six after a seventh
  // joined. So a thread joining after the lead answered starts the lead again,
  // in its own words, and the lead's new answer is the last word.
  it('a thread that joins after the lead answered starts the lead again', async () => {
    const a = thread(product, 'Write the on-call runbook');
    const first = await call(a.id, { cause: "Your Mac can't push to GitHub", new: true });
    work.updateItem(first.waitingOn, { result: '**Sign in once, and one thread carries on.**' }, { source: 'agent' });
    const b = thread(other, 'Why did last night\'s deploy take 40 minutes');
    await call(b.id, { causeId: first.waitingOn });
    const row = read(first.waitingOn);
    expect(row.answer).toBe("Why did last night's deploy take 40 minutes is waiting on this too.");
    expect(row.labels).toContain('hop:1');
  });

  it('not one that joins before the lead has said anything, which lists it anyway', async () => {
    const a = thread(product, 'Write the on-call runbook');
    const first = await call(a.id, { cause: "Your Mac can't push to GitHub", new: true });
    const b = thread(other, 'Audit the API');
    await call(b.id, { causeId: first.waitingOn });
    expect(read(first.waitingOn).answer).toBeUndefined();
  });

  it('and the lead is told to answer again in full', () => {
    expect(leadBrief({ cause: 'x', ask: 'y', from: 'z' })).toMatch(/is waiting on this too, answer again in full, naming every thread waiting now/);
  });

  it('a thread naming an open cause in the same words joins it at once, whatever the case', async () => {
    const a = thread(product, 'Who acts on comments');
    const first = await call(a.id, { cause: "Your Mac can't push to GitHub", new: true });
    const b = thread(other, 'Agentbox redesign');
    expect(await call(b.id, { cause: "your mac can't push to github " })).toMatchObject({ waitingOn: first.waitingOn, opened: false });
  });

  it('refuses a cause id that is not an open cause', async () => {
    const a = thread(product, 'Improve code quality');
    const out = await (await import('../mcp/tools.mts')).buildTools({ holder: 'x', ownItem: a.id }).tools.find((t) => t.name === 'wait_on_cause').run({ causeId: a.id });
    expect(out.isError).toBe(true);
    expect(read(a.id).status).not.toBe('blocked');
  });

  it('its lead may close the cause row without the person\'s words, unlike their own rows', async () => {
    const a = thread(product, 'Who acts on comments');
    const { waitingOn: id } = await call(a.id, { cause: "Your Mac can't push to GitHub", new: true });
    const claims = work.createClaimRegistry({ holder: 'lead', heartbeatMs: 60_000 });
    try {
      await claims.update(id, { status: 'done' });
      expect(read(id).status).toBe('done');
      const theirs = thread(product, 'Done task history view');
      await claims.update(theirs.id, { status: 'done' });
      expect(read(theirs.id).status).not.toBe('done');
    } finally { claims._stop(); }
  });
});

describe('closing the cause starts every thread behind it, in any project', () => {
  let sup; let items; let notes;
  beforeEach(() => {
    items = [];
    notes = [];
    sup = new Supervisor(
      { home: '/nonexistent-home-with-no-second-account', storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 2, authProfiles: ['default'] },
      { listItems: () => items, listProducts: () => [], isDue: () => true, noteItem: (p, id, note) => notes.push({ id, note }), answerItem: (p, id, patch) => { const i = items.find((x) => x.id === id); if (i && patch.status) i.status = patch.status; return i; } },
      '/nonexistent-app',
    );
    sup.spawnWorker = () => {};
    sup._waitsSince = T - 1;
  });

  it('resumes the thread in the cause\'s project and the one in another', () => {
    items = [cause('c1', { status: 'done', wrote: { kind: { source: 'system' }, status: { ts: T + 1000, source: 'agent' } } }), stuck('a', 'c1'), stuck('b', 'c1', { product: 'website' })];
    expect(sup.resumeFinishedWaits(items).sort()).toEqual(['a', 'b']);
  });

  it('tells each one the cause is cleared, since its own last words say it waits', () => {
    items = [cause('c1', { status: 'done', wrote: { kind: { source: 'system' }, status: { ts: T + 1000, source: 'agent' } } }), stuck('a', 'c1')];
    sup.resumeFinishedWaits(items);
    expect(notes).toEqual([{ id: 'a', note: "Your Mac can't push to GitHub is cleared. Carry on from where this stopped." }]);
  });

  it('says nothing like it when a plain thread it waited on finished', () => {
    items = [{ id: 't1', product: 'agentbox', status: 'done', kind: 'task', wrote: { status: { ts: T + 1000, source: 'agent' } } }, stuck('a', 't1')];
    expect(sup.resumeFinishedWaits(items)).toEqual(['a']);
    expect(notes).toEqual([]);
  });

  it('starts nothing while the cause is open', () => {
    items = [cause('c1'), stuck('a', 'c1'), stuck('b', 'c1', { product: 'website' })];
    expect(sup.resumeFinishedWaits(items)).toEqual([]);
  });

  it('does not reach into another project for a blocker that is not a cause', () => {
    const plain = { id: 't1', product: 'website', status: 'done', kind: 'task', wrote: { status: { ts: T + 1000, source: 'agent' } } };
    items = [plain, stuck('a', 't1')];
    expect(sup.resumeFinishedWaits(items)).toEqual([]);
  });
});

describe('the person reads the lead, not the lead\'s brief', () => {
  it('leaves out the body the app wrote, and keeps everything else', () => {
    const lines = [
      { id: 'c1', ts: 1, source: 'system', patch: { title: 'X', body: 'You are the lead on this cause.', kind: CAUSE_KIND } },
      { id: 'c1', ts: 2, source: 'agent', patch: { result: '**Sign in once, and six changes ship.**' } },
      { id: 'c1', ts: 3, source: 'founder', patch: { answer: 'Signed in', body: 'her own words' } },
    ];
    const shown = withoutBrief(lines);
    expect(shown[0].patch).toEqual({ title: 'X', kind: CAUSE_KIND });
    expect(shown[1]).toBe(lines[1]);
    expect(shown[2]).toBe(lines[2]);
  });
  it('and the thread view only does it for a cause row', () => {
    const view = fs.readFileSync(new URL('../renderer/src/components/ItemThread.tsx', import.meta.url), 'utf8');
    expect(view).toMatch(/lines: spoken\(r\?\.lines \?\? \[\]\)/);
    expect(view).toMatch(/isCauseLedger\(lines\) \? withoutBrief\(lines\) : lines/);
    // Main's "You asked" line under a working thread's title read the brief as her ask (2026-11-10).
    expect(view).toMatch(/workingContext\(isCause\(item\) \? '' : item\.body/);
  });
});

describe('every agent is told to wait on a cause rather than ask', () => {
  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  it('in its brief', () => expect(read('briefs/worker.md')).toMatch(/call `wait_on_cause` instead of asking them/));
  it('in the reply a failed ship sends it', () => expect(read('main/ship-queue.mts')).toMatch(/call `wait_on_cause` instead of asking the person/));
});
