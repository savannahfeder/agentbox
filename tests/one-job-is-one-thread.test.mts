// ONE JOB IS ONE THREAD, AND A RUN THAT FILES A SECOND ONE IS TOLD SO.
//
// Said 2026-10-11 (w-31b2eb82ba), after a QA campaign filed its four findings
// as four separate threads:
//
//   "I want you to fix all of those in one thread, feels unecessary to create
//   multiple threads and a bit confusing. I feel like my inbox has been
//   getting super cluttered with agents separating into multiple threads when
//   I don't want them to... I'm not exactly sure how to articulate why I
//   didn't want this"
//
// The articulation is that a campaign with four findings had ONE question in
// it — do you want these fixed — and four threads is four things to read, rank
// and either start or close, none of which existed until an agent filed them.
//
// It is NOT the app's structure, which was measured and is already right. A
// thread filed under another waits in Later and is drawn on its parent with
// one press (`isProposal`, renderer/src/list-rules.ts, shipped 2026-10-05).
// Folded off the real store on 2026-10-11: of the 10 open threads agents had
// filed, 9 carried a parent and so were in Later rather than in Needs you.
//
// Two other things made it happen.
//
// The brief said to split, in so many words. "One row, or several" read
// "Twenty issues off one call are twenty rows", which answers how many THINGS
// were found; the question is how many ANSWERS are needed.
//
// And nothing pushed back. Four threads went in from one session in 53 seconds
// (ledger, 2026-10-09: w-15a1169588 at ts 1791590262078 through w-c5a07d04ab
// at 1791590315190) with no count, no notice and no refusal anywhere. A brief
// is easy to read past at the end of a long run, so the store now says it in
// the filing tool's own answer, where the session reads it and can still fold
// the thread back before anyone sees it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mts';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* ------------------------------- the brief ------------------------------- */

describe('the brief tells a worker that one job is one thread', () => {
  let root; let appDir;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'one-thread-store-'));
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-thread-app-'));
    fs.mkdirSync(path.join(appDir, 'briefs'), { recursive: true });
    for (const f of fs.readdirSync(path.join(REPO, 'briefs'))) {
      fs.copyFileSync(path.join(REPO, 'briefs', f), path.join(appDir, 'briefs', f));
    }
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(appDir, { recursive: true, force: true });
  });

  const brief = () => {
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
    const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, appDir);
    return sup.buildBrief(
      { id: 'w-1', product: 'p', title: 'do the thing', labels: [] },
      { slug: 'p', name: 'P', dir: fs.mkdtempSync(path.join(root, 'prod-')), repoPath: null },
      { continuation: false },
    );
  };

  it('says one thread is the default', () => {
    expect(brief()).toContain('DEFAULT TO ONE THREAD');
  });

  it('asks how many answers are needed, not how many things were found', () => {
    expect(brief()).toMatch(/how many ANSWERS/);
  });

  it('no longer tells it that twenty issues off one call are twenty threads', () => {
    const text = brief();
    expect(text).not.toContain('twenty rows');
    expect(text).not.toContain('are twenty');
    // The same example, turned around: twenty issues with one answer are one.
    // The brief is hard-wrapped, so the line may break anywhere inside this.
    expect(text).toMatch(/[Tt]wenty\s+issues\s+off\s+one\s+call\s+are\s+ONE\s+thread/);
  });

  it('says what filing one under a thread does to their inbox', () => {
    expect(brief()).toMatch(/`parent`/);
  });

  it('still says a fan of subagents is one thread, not ten', () => {
    expect(brief()).toMatch(/[Ss]ubagents are not threads/);
  });

  // SAID AGAIN 2026-10-13 (w-554834e749), because the rule above had not
  // shipped and the threads kept coming: "It tends to break down work into a
  // bunch of different threads that logically should all be grouped together
  // in one PR... If you need to do different things in parallel... You
  // probably want to use subagents rather than different threads." And the
  // handoffs: agents passing work to another thread that then cannot be found.
  it('says one PR is one thread', () => {
    expect(brief()).toMatch(/one PR is one\s+thread/);
  });

  it('sends parallel work to subagents in this thread, not to new threads', () => {
    expect(brief()).toMatch(/parallel\s+work\s+as\s+subagents\s+in\s+this\s+one/);
  });

  it('says never to hand work to another thread that could be done here', () => {
    expect(brief()).toMatch(/Never\s+hand\s+work\s+to\s+another\s+thread\s+that\s+you\s+could\s+do\s+here/);
  });

  // The reason for a cap at all, kept from the rule this replaces: it is short
  // "because tokens are scarce", and a rule that grows into a page has stopped
  // being the thing that was asked for. The cap was 600 characters when the
  // rule was the two sentences that produced four threads, and the rewrite
  // measures 567, so the cap stays where it was. There is a harder reason not
  // to let it drift: the whole scaffolding is capped at 6,000 characters
  // (tests/the-brief-only-says-what-applies.test.mts) and measures 5,990 with
  // this rule in it. Ten characters. Anything added here comes out elsewhere.
  it('stays short enough to be worth its tokens', () => {
    const text = brief();
    const from = text.indexOf('## One job is one thread');
    expect(from).toBeGreaterThan(-1);
    const section = text.slice(from, text.indexOf('\n## ', from + 1));
    expect(section.length).toBeLessThan(600);
    expect(section.length).toBeGreaterThan(200);
  });
});

/* -------------------- and the filing tool's own description -------------------- */
// The brief is not the only thing a worker reads before it files. The tool said
// "Anything you discover but cannot finish now belongs here rather than in a
// message", which is true of a finding and false of a finding that belongs in
// the thread the agent is already on — and it said nothing at all about what
// `parent` does, which is the field that decides whether a filing lands in
// their inbox or waits quietly in Later.
describe('the filing tool says the same thing as the brief', () => {
  let tools;

  beforeEach(async () => {
    const home = (await import('../main/store/home.mts')).appHome();
    process.env.STORE_ACCOUNT_ID = 'acct-tools';
    fs.mkdirSync(path.join(home, 'accounts', 'acct-tools'), { recursive: true });
    ({ tools } = (await import('../mcp/tools.mts')).buildTools({ holder: 'test' }));
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  const filing = () => tools.find((t) => t.name === 'create_work_item');

  it('asks how many answers are needed before a second thread is filed', () => {
    expect(filing().description).toMatch(/ONE JOB IS ONE THREAD/);
    expect(filing().description).toMatch(/answers/i);
  });

  it('says what a parent does: Later and the thread it came from, not their inbox', () => {
    const said = `${filing().description} ${filing().schema.parent?.description ?? ''}`;
    expect(said).toMatch(/Later/);
    expect(said).toMatch(/inbox/);
  });

  // w-554834e749: the same two things the brief now says, where the session
  // reads them at the moment it is about to file.
  it('says one PR is one thread, and parallel work is subagents', () => {
    expect(filing().description).toMatch(/one PR is one thread/i);
    expect(filing().description).toMatch(/parallel.*subagents/i);
  });

  it('no longer sends what cannot be finished here rather than to the thread', () => {
    expect(filing().description).not.toContain('belongs here rather than in a message');
  });
});

/* --------------------------- and the store says so --------------------------- */

describe('a second thread filed in one run', () => {
  let product; let work; let claims;

  beforeEach(async () => {
    const home = (await import('../main/store/home.mts')).appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    product = createProduct(`Threads ${Math.random().toString(36).slice(2, 8)}`);
    work = await import('../mcp/core/work.mts');
    claims = work.createClaimRegistry({ holder: 'test-worker', heartbeatMs: 60_000 });
  });
  afterEach(() => { claims._stop(); delete process.env.STORE_ACCOUNT_ID; });

  const campaign = (title = 'QA campaign on the Codex engine') =>
    work.createItem(product.id, { title, labels: ['founder'] }, { source: 'founder' });

  it('the first one is filed with nothing said about it', () => {
    const parent = campaign();
    const filed = claims.file(product.id, { title: 'A Codex worker leaves its sandbox', parent: parent.id });
    expect(filed.alsoFiled).toBeUndefined();
  });

  // The reported case, to the number: four findings off one campaign.
  it('the second, third and fourth under the same thread each say so', () => {
    const parent = campaign();
    const titles = [
      'A Codex worker leaves its sandbox',
      'The Codex meter cannot say the quota is spent',
      'A Codex worker that needs to ask gets an error',
      'Two sessions racing for one task folder show a raw git error',
    ];
    const said = titles.map((title) => claims.file(product.id, { title, parent: parent.id }).alsoFiled);
    expect(said[0]).toBeUndefined();
    for (const s of said.slice(1)) {
      expect(s).toMatch(/ONE JOB IS ONE THREAD/);
      expect(s).toContain(parent.id);
    }
    // And it counts, so the fourth reads louder than the second.
    expect(said[1]).toMatch(/^2 /);
    expect(said[3]).toMatch(/^4 /);
  });

  // THE CASE THAT MUST NOT MATCH: two threads that are genuinely two jobs.
  it('one under each of two different threads says nothing', () => {
    const one = campaign('The Codex engine');
    const two = campaign('The landing page');
    expect(claims.file(product.id, { title: 'Fix the sandbox', parent: one.id }).alsoFiled).toBeUndefined();
    expect(claims.file(product.id, { title: 'Fix the headline', parent: two.id }).alsoFiled).toBeUndefined();
  });

  // The boundary the other way: the sibling is finished, so nothing is waiting
  // on them twice and this is the only live thread under the campaign.
  it('a thread whose only sibling is already finished says nothing', async () => {
    const parent = campaign();
    const first = claims.file(product.id, { title: 'Fix the sandbox', parent: parent.id });
    await claims.update(first.id, { status: 'done' });
    expect(claims.file(product.id, { title: 'Fix the meter', parent: parent.id }).alsoFiled).toBeUndefined();
  });

  // Worse than a second proposal, because a thread filed under nothing IS a
  // row in their inbox (list-rules.ts), which is the clutter they named.
  it('two filed under no thread at all: the second says so', () => {
    expect(claims.file(product.id, { title: 'Something I noticed' }).alsoFiled).toBeUndefined();
    const second = claims.file(product.id, { title: 'Something else I noticed' });
    expect(second.alsoFiled).toMatch(/ONE JOB IS ONE THREAD/);
    expect(second.alsoFiled).toMatch(/no thread at all/);
  });

  it('says it without refusing the filing, so nothing an agent found is lost', () => {
    const parent = campaign();
    claims.file(product.id, { title: 'First' , parent: parent.id });
    const second = claims.file(product.id, { title: 'Second', parent: parent.id });
    expect(second.id).toMatch(/^w-/);
    expect(second.title).toBe('Second');
    expect(work.listWorkItems({ product: product.id }).map((i) => i.title)).toContain('Second');
  });
});
