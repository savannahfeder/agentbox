// WHAT A WORKER IS ACTUALLY HANDED WHEN SHE REPLIES.
//
// Two holes, both measured on her own store before this landed:
//
// THE PICTURE A pasted screenshot lands in the body as a RELATIVE markdown
// link, and nothing in the brief ever said to open it. 320 sessions on Agentbox
// were handed a task carrying one of her pictures and 155 of them, 48%, never
// opened it. On a product with a code repo registered the relative path would
// not even have resolved, since the worker's cwd is the repo. THE THREAD Every
// reply spawned a fresh session holding one field. It saw her newest answer and
// nothing else: not her earlier answers on the same row, not the work it was
// replying about, not the checkpoint the last session left her.
//
// WHAT CAN SILENTLY BREAK, which is what this file is for. Both fixes are text
// in a prompt: nothing throws when they stop working, the worker simply arrives
// ignorant again and does confident work on half an instruction. So these are
// driven through the real ledger on a real product dir with real files on disk,
// never through a hand-made thread object.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { envName } from '../shared/product-name.mjs';
import { Store } from '../main/store.mjs';
import { threadOf } from '../shared/work-items.mjs';

let root;
let store;
let product;

const line = (o) => JSON.stringify(o);

async function makeStore() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-'));
  const dir = path.join(root, 'acme');
  fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ slug: 'acme', name: 'Acme' }));
  fs.writeFileSync(path.join(dir, 'STATE.md'), '# Acme — STATE\n\nNothing decided.\n');
  store = await new Store({ accountRoot: root }).init();
  product = { slug: 'acme', name: 'Acme', dir, repoPath: null };
  return dir;
}

// Just the files section, because the body is echoed in the brief verbatim and
// a path SHE typed being present there proves nothing either way.
const filesSection = (brief) => {
  const at = brief.indexOf('# The files this task carries');
  if (at < 0) return '';
  const end = brief.indexOf('\n# ', at + 1);
  return brief.slice(at, end < 0 ? undefined : end);
};

const supervisor = (over = {}) => {
  const s = Object.create(Supervisor.prototype);
  s.appDir = root;
  s.dataDir = root;
  s.config = { personalProducts: [] };
  s.store = store;
  s.statePageOn = () => true;
  s.writingRules = () => '';
  return Object.assign(s, over);
};

beforeEach(async () => { await makeStore(); });
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} });

/* ------------------------------- the picture ----------------------------- */
describe('the picture she attached', () => {
  it('reaches the worker as an absolute path with an instruction to open it', async () => {
    const dir = product.dir;
    fs.writeFileSync(path.join(dir, 'attachments', 'k1-shot.png'), 'PNG');
    const item = {
      id: 'w-52a79b0b67', product: 'acme', title: 'the doc pane',
      body: 'Make it look like this.\n\n![shot.png](attachments/k1-shot.png)',
    };
    const brief = supervisor().buildBrief(item, product, { continuation: false });

    // The absolute path, because relative was the whole bug.
    expect(brief).toContain(path.join(dir, 'attachments', 'k1-shot.png'));
    // And the sentence, because a path nobody is told to open is what 122
    // sessions already had.
    expect(brief).toMatch(/READ (IT|THEM) BEFORE YOU DO ANYTHING ELSE/);
  });

  it('finds a picture she attached to an ANSWER, not only one in the body', async () => {
    const dir = product.dir;
    fs.writeFileSync(path.join(dir, 'attachments', 'k2-reply.png'), 'PNG');
    const item = {
      id: 'w-568ca63f74', product: 'acme', title: 'round two', body: 'Which of the three?',
      answer: 'This one and then this one.\n\n![reply.png](attachments/k2-reply.png)',
    };
    const brief = supervisor().buildBrief(item, product, { continuation: true });
    expect(brief).toContain(path.join(dir, 'attachments', 'k2-reply.png'));
  });

  it('names no file that is not on disk, so the section stays trustworthy', async () => {
    const item = {
      id: 'w-42aae402a2', product: 'acme', title: 'x',
      body: 'see [the sheet](reports/never-written.csv)',
    };
    const brief = supervisor().buildBrief(item, product, { continuation: false });
    expect(filesSection(brief)).toBe('');
  });

  /* ------------------------ the picture that is gone ----------------------- */
  // The one thing that is worse than a path a worker cannot open: no sign at
  // all that there was a picture. `attachments/` is where the app itself puts
  // every picture she pastes, so a name missing from there WAS an attachment.
  it('says so when a picture she attached is gone, rather than going quiet', async () => {
    const item = {
      id: 'w-42aae402a2', product: 'acme', title: 'x',
      body: 'see ![gone.png](attachments/never-saved.png)',
    };
    const section = filesSection(supervisor().buildBrief(item, product, { continuation: false }));
    expect(section).toMatch(/NO LONGER ON DISK/);
    expect(section).toContain('attachments/never-saved.png');
    expect(section).toMatch(/Do not guess at what it showed/);
    // Never offered as somewhere to go and look: the short name she would
    // recognise, not an absolute path with nothing at the end of it.
    expect(section).not.toContain(path.join(product.dir, 'attachments', 'never-saved.png'));
  });

  // A `.png` in prose is usually a word rather than a file, and a warning that
  // fires on those teaches a reader to skim the one that matters.
  it('stays quiet about a picture named in prose that was never an attachment', async () => {
    const item = {
      id: 'w-42aae402a3', product: 'acme', title: 'x',
      body: 'the old logo.png was better than this one',
    };
    expect(filesSection(supervisor().buildBrief(item, product, { continuation: false }))).toBe('');
  });

  // Both halves in one brief, because the real case is a row carrying several
  // pictures where one of them did not survive.
  it('keeps the picture it has and the picture it lost apart', async () => {
    const dir = product.dir;
    fs.writeFileSync(path.join(dir, 'attachments', 'k6-here.png'), 'PNG');
    const item = {
      id: 'w-42aae402a4', product: 'acme', title: 'x',
      body: 'this ![here.png](attachments/k6-here.png) and this ![gone.png](attachments/k6-gone.png)',
    };
    const section = filesSection(supervisor().buildBrief(item, product, { continuation: false }));
    expect(section).toMatch(/ATTACHED A PICTURE\. READ IT/);
    expect(section).toContain(path.join(dir, 'attachments', 'k6-here.png'));
    expect(section).toMatch(/NO LONGER ON DISK/);
    expect(section).toContain('attachments/k6-gone.png');
  });

  // A Codex row is handed its pictures in the turn itself, so a picture that is
  // gone is not in the turn either and the words are the only warning there is.
  it('warns a Codex row too, and hands it no picture it cannot see', async () => {
    const item = {
      id: 'w-42aae402a5', product: 'acme', title: 'x',
      body: 'see ![gone.png](attachments/k7-gone.png)',
    };
    const section = filesSection(supervisor().buildBrief(item, product, { continuation: false, engine: 'codex' }));
    expect(section).toMatch(/NO LONGER ON DISK/);
    expect(supervisor().attachedPictures(item, product)).toEqual([]);
  });

  it('will not name a path that walks out of the product', async () => {
    fs.writeFileSync(path.join(root, 'secret.png'), 'PNG');
    const item = {
      id: 'w-0c714fea93', product: 'acme', title: 'x',
      body: 'see [x](../secret.png)',
    };
    const brief = supervisor().buildBrief(item, product, { continuation: false });
    expect(filesSection(brief)).toBe('');
    expect(brief).not.toContain(path.join(root, 'secret.png'));
  });

  it('rides in a RESUMED session too, because that is the one thing it lacks', async () => {
    const dir = product.dir;
    fs.writeFileSync(path.join(dir, 'attachments', 'k5-late.png'), 'PNG');
    const item = {
      id: 'w-210d67b996', product: 'acme', title: 'x', body: 'no picture here',
      answer: 'like this ![late.png](attachments/k5-late.png)',
    };
    const brief = supervisor().resumeBrief(item, { continuation: true, product });
    expect(brief).toContain(path.join(dir, 'attachments', 'k5-late.png'));
  });
});

/* ------------------------------ the thread ------------------------------- */
describe('the conversation on the row', () => {
  const seed = (dir, id, rows) => {
    fs.writeFileSync(
      path.join(dir, 'work-items.jsonl'),
      rows.map((r) => line({ id, ts: r.ts, source: r.source, patch: r.patch })).join('\n') + '\n',
    );
  };

  it('hands the worker every earlier answer and every earlier round of work', async () => {
    const dir = product.dir;
    const id = 'w-9048ece8c4';
    seed(dir, id, [
      { ts: 1000, source: 'agent', patch: { title: 'themes', body: 'Pick a dark palette.' } },
      { ts: 2000, source: 'founder', patch: { answer: 'None of these, they are all too blue.' } },
      { ts: 3000, source: 'agent', patch: { body: 'Pick a warmer dark palette.', result: 'Five warm greys are shot.' } },
      { ts: 4000, source: 'founder', patch: { answer: 'Give me more options.' } },
    ]);
    const item = store.readItem('acme', id);
    const brief = supervisor().buildBrief({ ...item, product: 'acme' }, product, { continuation: true });

    // Her FIRST answer, the one a continuation could never see before.
    expect(brief).toContain('None of these, they are all too blue.');
    // The work she was reacting to.
    expect(brief).toContain('Five warm greys are shot.');
    expect(brief).toContain('Pick a dark palette.');
    expect(brief).toContain('# The conversation on this row so far');
  });

  it('does not print the current body or her latest answer twice', async () => {
    const dir = product.dir;
    const id = 'w-54bc7816f0';
    seed(dir, id, [
      { ts: 1000, source: 'agent', patch: { title: 't', body: 'FIRST ASK' } },
      { ts: 2000, source: 'founder', patch: { answer: 'EARLIER WORD' } },
      { ts: 3000, source: 'agent', patch: { body: 'CURRENT ASK' } },
      { ts: 4000, source: 'founder', patch: { answer: 'LATEST WORD' } },
    ]);
    const item = store.readItem('acme', id);
    const brief = supervisor().buildBrief({ ...item, product: 'acme' }, product, { continuation: true });
    const count = (s) => brief.split(s).length - 1;
    expect(count('CURRENT ASK')).toBe(1);
    expect(count('LATEST WORD')).toBe(1);
    expect(count('EARLIER WORD')).toBe(1);
    expect(count('FIRST ASK')).toBe(1);
  });

  it('says nothing at all on a row where nothing has been said yet', async () => {
    const dir = product.dir;
    const id = 'w-b7c50bac1e';
    seed(dir, id, [{ ts: 1000, source: 'agent', patch: { title: 't', body: 'the only ask' } }]);
    const item = store.readItem('acme', id);
    const brief = supervisor().buildBrief({ ...item, product: 'acme' }, product, { continuation: false });
    expect(brief).not.toContain('# The conversation on this row so far');
  });

  it('labels who spoke, so a session cannot read its own checkpoint as her word', async () => {
    const dir = product.dir;
    const id = 'w-5b4a0ffda9';
    seed(dir, id, [
      { ts: 1000, source: 'agent', patch: { title: 't', body: 'ask' } },
      { ts: 2000, source: 'agent', patch: { note: 'I shot four and I like the third.' } },
      { ts: 3000, source: 'founder', patch: { answer: 'HER EARLIER PICK' } },
      { ts: 4000, source: 'founder', patch: { answer: 'actually the fourth' } },
    ]);
    const item = store.readItem('acme', id);
    const brief = supervisor().buildBrief({ ...item, product: 'acme' }, product, { continuation: true });
    const at = (s) => brief.indexOf(s);
    expect(at('I shot four and I like the third.')).toBeGreaterThan(-1);
    // her earlier answer sits under a founder label, the checkpoint under ours
    expect(brief.slice(at('HER EARLIER PICK') - 400, at('HER EARLIER PICK'))).toContain('THE FOUNDER');
    expect(brief.slice(at('I shot four') - 200, at('I shot four'))).toContain('previous session');
  });

  it('cuts the oldest turns out loud rather than quietly, when a row is enormous', async () => {
    const dir = product.dir;
    const id = 'w-859f3c0ba0';
    const fat = (tag) => `${tag} ` + 'x'.repeat(9000);
    seed(dir, id, [
      { ts: 1000, source: 'agent', patch: { title: 't', body: fat('OLDEST') } },
      { ts: 2000, source: 'founder', patch: { answer: fat('MIDDLE') } },
      { ts: 3000, source: 'agent', patch: { result: fat('NEWER') } },
      { ts: 4000, source: 'agent', patch: { body: 'current ask' } },
      { ts: 5000, source: 'founder', patch: { answer: 'latest word' } },
    ]);
    const item = store.readItem('acme', id);
    const brief = supervisor().buildBrief({ ...item, product: 'acme' }, product, { continuation: true });
    expect(brief).toContain('older turn(s) are cut from this transcript');
    expect(brief).toContain('work-items.jsonl');
    // AND THE FILE IT NAMES IS ONE THAT EXISTS. This line used to say "the
    // product's work-items.jsonl", which after the folder move is the one place
    // the ledger is not.
    expect(brief).toContain(`$${envName('HOME')}/projects/`);
    expect(brief).not.toContain("the product's work-items.jsonl");
    // the NEWEST turns are the ones kept
    expect(brief).toContain('NEWER');
  });
});

/* ------------------------------- the reader ------------------------------ */
describe('threadOf, over the ledger as it is actually written', () => {
  it('ignores a heartbeat, which carries a patch nobody wrote', () => {
    const turns = threadOf([
      { id: 'w-1', ts: 1, source: 'agent', patch: { body: 'the ask' } },
      { id: 'w-1', ts: 2, source: 'agent', heartbeat: true, epoch: 1, claim: { holder: 'x', leaseUntil: 9 }, patch: { status: 'claimed', body: 'the ask' } },
      { id: 'w-1', ts: 3, source: 'founder', patch: { answer: 'yes' } },
    ], 'w-1');
    expect(turns.map((t) => t.field)).toEqual(['body', 'answer']);
  });

  it('keeps only one copy of an unchanged body re-sent with a new title', () => {
    const turns = threadOf([
      { id: 'w-1', ts: 1, source: 'agent', patch: { title: 'a', body: 'same words' } },
      { id: 'w-1', ts: 2, source: 'agent', patch: { title: 'b', body: 'same words' } },
    ], 'w-1');
    expect(turns).toHaveLength(1);
  });

  it('reads only the row it was asked for', () => {
    const turns = threadOf([
      { id: 'w-1', ts: 1, source: 'agent', patch: { body: 'mine' } },
      { id: 'w-2', ts: 2, source: 'agent', patch: { body: 'someone else' } },
    ], 'w-1');
    expect(turns.map((t) => t.text)).toEqual(['mine']);
  });

  it('records who spoke, with the founder outranking the line she rode in on', () => {
    const turns = threadOf([{ id: 'w-1', ts: 1, source: 'founder', patch: { answer: 'mine' } }], 'w-1');
    expect(turns[0].source).toBe('founder');
  });
});
