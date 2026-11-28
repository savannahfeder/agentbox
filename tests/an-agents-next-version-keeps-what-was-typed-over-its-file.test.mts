// AN AGENT'S NEXT VERSION KEEPS WHAT WAS TYPED OVER ITS FILE (w-b17dd2f06f).
//
// What broke: on a cloud run, a person typed two edits straight into
// dream-launch-loom-script.md, which the thread's agent had written: they
// deleted a line and changed "one-hundred fold" to "one-hundred/ten fold". The
// agent's next version (versionOf, from its remembered copy) came back as -v4
// with both edits gone and no word of a merge. No v2 or v3 was on disk.
//
// Measured here: the merge only ran when the thread's own versions numbered
// exactly as many as were counted for the file. A thread that also names a
// copy outside the documents (a cloud run's scratch copy) or a Files count
// above the thread's both tipped that, and so did a newest "version" that is
// not on this Mac: each returned no merge at all, and the agent's words were
// saved over nothing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { legacyRoot } from '../main/store/project.mts';
import { teamDir, writeTeamView } from '../main/store/teammates-files.mts';
import { servedHere } from '../main/cloud/run.mts';

const NAME = 'dream-launch-loom-script.md';
const SCRIPT = [
  "Today we're launching Dream, the inbox that does your work before you open it.",
  '',
  "I don't answer messages anymore. My AI teammates do.",
  '',
  'Agents can now do almost any work we hand them. We just scaled yours one-hundred fold.',
  '',
  'But your work still comes from everywhere: a Slack message, a GitHub issue, a comment in Notion.',
  '',
  'So we built Dream. It watches every place your work comes from.',
  '',
  'This morning, AJ asked for a review on GitHub. By the time I saw it, the review was drafted.',
  '',
  'Welcome to the era of infinite attention.',
  '',
  'You can download it today.',
  '',
].join('\n');
// What they typed over the file: one line gone, one word changed.
const TYPED = SCRIPT
  .replace("I don't answer messages anymore. My AI teammates do.\n\n", '')
  .replace('one-hundred fold', 'one-hundred/ten fold');
// The agent's own change, made to the copy it remembers.
const theAgents = (s) => s.replace('You can download it today.', 'Download it today, free.');

let product; let dir; let store; let row; let acct;

async function setUp() {
  acct = `acct-typed-${Math.random().toString(36).slice(2, 8)}`;
  process.env.STORE_ACCOUNT_ID = acct;
  fs.mkdirSync(path.join(appHome(), 'accounts', acct), { recursive: true });
  (await import('../mcp/core/account.mts')).resolveAccount();
  const { createProduct } = await import('../mcp/core/products.mts');
  product = createProduct(`Company ${Math.random().toString(36).slice(2, 8)}`);
  dir = path.join(appHome(), 'accounts', acct, product.id);
  store = await import('../main/store/work-items.mts');
  const work = await import('../mcp/core/work.mts');
  row = work.createItem(product.id, { title: 'Viral video analysis', labels: ['founder'] }, { source: 'founder' });
  return work;
}
const said = (r) => {
  if (r.isError) throw new Error(r.content[0].text);
  return JSON.parse(r.content[0].text);
};
const text = (rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
/** What the document beside a thread does with typing: the file itself, rewritten. */
const typeOver = (rel, words) => fs.writeFileSync(path.join(dir, rel), words);

// How the count of the file's versions comes apart from the ones this thread can read.
const APART = {
  'nothing else': () => {},
  'the thread also names copies of it outside the documents': () => {
    for (const h of ['8836/8232', 'a1b2/c3d4']) {
      store.updateWorkItem(dir, row.id, { note: `Read [${NAME}](/tmp/agentbox-resources/${h}/${row.id}/${NAME}).` }, { source: 'agent' });
    }
  },
  'Files counts more versions than the thread holds': (first) => {
    writeTeamView(teamDir(legacyRoot(), acct), { at: Date.now(), me: null, people: [], rooms: [], cards: [], folders: [{ id: 'f-1', project: product.name, folder: 'Launch', files: [{ file: NAME, path: path.join(dir, first), versions: 3 }] }] });
  },
};

for (const [how, apart] of Object.entries(APART)) {
  describe(`typing over an agent's first version, when ${how}`, () => {
    let write; let first;
    beforeEach(async () => {
      await setUp();
      process.env.ZERO_PRODUCT = product.id;
      process.env.ZERO_ITEM = row.id;
      const { tools } = (await import('../mcp/tools.mts')).buildTools({ holder: 'test-worker', ownItem: row.id });
      write = (fields) => tools.find((t) => t.name === 'write_document').run({ product: product.id, ...fields });
      first = said(await write({ path: `designs/${row.id}/${NAME}`, title: 'Dream launch Loom script', content: SCRIPT })).path;
      apart(first);
    });
    afterEach(() => { delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_PRODUCT; delete process.env.ZERO_ITEM; });

    it('keeps the typed edits when the agent writes from the copy it remembers, and says so', async () => {
      typeOver(first, TYPED);
      const r = said(await write({ versionOf: NAME, content: theAgents(SCRIPT) }));
      expect(text(r.path)).toBe(theAgents(TYPED));
      expect(r.merged).toBe(first);
      expect(r.note).toMatch(/kept the edit someone made/);
    });

    it('saves the agent\'s words as written when nobody typed anything', async () => {
      const r = said(await write({ versionOf: NAME, content: theAgents(SCRIPT) }));
      expect(text(r.path)).toBe(theAgents(SCRIPT));
      expect(r.merged).toBeUndefined();
    });

    it('saves the agent\'s words as written when its copy already repeats the typed edits word for word', async () => {
      typeOver(first, TYPED);
      const r = said(await write({ versionOf: NAME, content: theAgents(TYPED) }));
      expect(text(r.path)).toBe(theAgents(TYPED));
      expect(r.merged).toBeUndefined();
    });

    it('is refused, saving nothing, when the agent rewrites the very line they changed', async () => {
      typeOver(first, TYPED);
      const before = fs.readdirSync(path.join(dir, 'designs', row.id));
      const r = await write({ versionOf: NAME, content: SCRIPT.replace('one-hundred fold', 'a thousand fold') });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/changed since you read it/);
      expect(fs.readdirSync(path.join(dir, 'designs', row.id))).toEqual(before);
    });
  });
}

// A file the agent wrote with its own tools, or one a cloud run sent home, was
// never through write_document, so nothing kept the agent's words and the merge
// could not tell them from the person's typing. The pane's save keeps them.
describe('typing in the app over a document the agent wrote with its own tools', () => {
  let write; let rel;
  beforeEach(async () => {
    await setUp();
    process.env.ZERO_PRODUCT = product.id;
    process.env.ZERO_ITEM = row.id;
    const { tools } = (await import('../mcp/tools.mts')).buildTools({ holder: 'test-worker', ownItem: row.id });
    write = (fields) => tools.find((t) => t.name === 'write_document').run({ product: product.id, ...fields });
    rel = `designs/${row.id}/${NAME}`;
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), SCRIPT);
    store.updateWorkItem(dir, row.id, { result: `The script: [${NAME}](${rel}).` }, { source: 'agent' });
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_PRODUCT; delete process.env.ZERO_ITEM; });
  const typeInTheApp = async (words) => {
    const { writeDoc } = await import('../main/doc-file.mts');
    expect(writeDoc({ file: path.join(dir, rel), product: { dir, name: product.name }, text: words }).ok).toBe(true);
  };

  it('keeps the typed edits in the agent\'s next version', async () => {
    await typeInTheApp(TYPED);
    const r = said(await write({ versionOf: NAME, content: theAgents(SCRIPT) }));
    expect(text(r.path)).toBe(theAgents(TYPED));
    expect(r.merged).toBe(rel);
  });

  it('keeps every save of the sitting, not only the last', async () => {
    await typeInTheApp(TYPED.replace('one-hundred/ten', 'one-hundred/te'));
    await typeInTheApp(TYPED);
    const r = said(await write({ versionOf: NAME, content: theAgents(SCRIPT) }));
    expect(text(r.path)).toBe(theAgents(TYPED));
  });

  it('saves the agent\'s words as written when nobody typed anything', async () => {
    const r = said(await write({ versionOf: NAME, content: theAgents(SCRIPT) }));
    expect(text(r.path)).toBe(theAgents(SCRIPT));
    expect(r.merged).toBeUndefined();
  });

  it('saves the agent\'s words as written when its copy already repeats the typed edits word for word', async () => {
    await typeInTheApp(TYPED);
    const r = said(await write({ versionOf: NAME, content: theAgents(TYPED) }));
    expect(text(r.path)).toBe(theAgents(TYPED));
    expect(r.merged).toBeUndefined();
  });
});

// A cloud run's store tools are served inside the app on the Mac, one process
// for every run, so the process's own ZERO_ITEM is whichever run started last.
describe('the same on a cloud run, its tools served in the app beside another run', () => {
  let call; let other; let procs;
  const hello = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } };
  function talker(proc) {
    let buf = '';
    const waiting = new Map();
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (d) => {
      buf += d;
      for (let i; (i = buf.indexOf('\n')) >= 0;) {
        const msg = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        waiting.get(msg.id)?.(msg);
      }
    });
    let id = 10;
    return (line) => new Promise((resolve) => {
      const n = line.id ?? (id += 1);
      waiting.set(n, resolve);
      proc.stdin.write(JSON.stringify({ ...line, id: n }) + '\n');
    });
  }
  const serve = async (item) => {
    const env = { STORE_ACCOUNT_ID: acct, ZERO_PRODUCT: product.id, ZERO_ITEM: item };
    const proc = servedHere({ command: '/nowhere/mcp/agentbox-mcp.sh', env }, env, `r-${item}`);
    procs.push(proc);
    const talk = talker(proc);
    await talk(hello);
    return async (args) => (await talk({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'write_document', arguments: { product: product.id, ...args } } })).result;
  };

  beforeEach(async () => {
    procs = [];
    const work = await setUp();
    other = work.createItem(product.id, { title: 'Another thread', labels: ['founder'] }, { source: 'founder' });
    call = await serve(row.id);
    await serve(other.id);
    expect(process.env.ZERO_ITEM).toBe(other.id);
  });
  afterEach(async () => {
    for (const p of procs) { const closed = new Promise((r) => p.on('close', r)); p.stdin.end(); await closed; }
    delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_PRODUCT; delete process.env.ZERO_ITEM;
  });

  for (const how of ['nothing else', 'the thread also names copies of it outside the documents']) {
    it(`keeps the typed edits when ${how}`, async () => {
      const first = said(await call({ path: `designs/${row.id}/${NAME}`, title: 'Dream launch Loom script', content: SCRIPT })).path;
      APART[how]();
      typeOver(first, TYPED);
      const r = said(await call({ versionOf: NAME, content: theAgents(SCRIPT) }));
      expect(path.dirname(r.path)).toBe(`designs/${row.id}`);
      expect(text(r.path)).toBe(theAgents(TYPED));
      expect(r.merged).toBe(first);
    });
  }

  it('saves the agent\'s words as written when nobody typed anything', async () => {
    said(await call({ path: `designs/${row.id}/${NAME}`, title: 'Dream launch Loom script', content: SCRIPT }));
    const r = said(await call({ versionOf: NAME, content: theAgents(SCRIPT) }));
    expect(text(r.path)).toBe(theAgents(SCRIPT));
    expect(r.merged).toBeUndefined();
  });
});
