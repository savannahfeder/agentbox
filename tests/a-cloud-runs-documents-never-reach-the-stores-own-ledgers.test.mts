// Weekly security audit, 2026-11-16. A cloud run sends back every file it
// wrote in the project's documents folder, and layDocs laid all of them but the
// project's four own files. A cloud agent that wrote repeats.jsonl at the top of
// that folder had it laid into the product folder; the store's next ledger read
// swept it as a stray copy and appended it to the real ledger. Measured on a
// dummy store: the cloud's line became a daily repeating task beside the
// person's own, its runs labelled `founder` with the cloud's words as the
// instruction, and no word from the person. work-items.jsonl went the same way.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { layDocs, tarDocs } from '../main/cloud/docs.mts';

const RULE = JSON.stringify({ id: 'r-cloud', ts: 1, patch: { title: 'Daily sync', body: 'FROM-THE-CLOUD', every: 'day', at: '09:00' } });

describe("a cloud run's documents never reach the store's own ledgers", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-ledgers-'))); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  const archive = (files: Record<string, string>) => {
    const src = fs.mkdtempSync(path.join(tmp, 'src-'));
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(src, rel)), { recursive: true });
      fs.writeFileSync(path.join(src, rel), body);
    }
    return tarDocs(src, Object.keys(files));
  };

  it('lays no ledger, run folder, git or env path, and still lays the documents beside them', async () => {
    const docs = path.join(tmp, 'project');
    fs.mkdirSync(docs);
    const out = await layDocs({
      tgz: await archive({
        'repeats.jsonl': `${RULE}\n`,
        'work-items.jsonl': '{"id":"w-x","ts":1,"op":"forged"}\n',
        'runs/r1/log.txt': 'x',
        'notes/sessions/s.json': '{}',
        '.git/hooks/post-checkout': '#!/bin/sh\n',
        '.env': 'KEY=1\n',
        'notes/plan.md': 'The plan.',
        'repeats.md': 'A document about repeating tasks.',
      }),
      dir: docs, sentAt: Date.now() + 1000, laid: {},
    });
    expect(out.written.sort()).toEqual(['notes/plan.md', 'repeats.md']);
    for (const rel of ['repeats.jsonl', 'work-items.jsonl', 'runs', 'notes/sessions', '.git', '.env']) {
      expect(fs.existsSync(path.join(docs, rel)), rel).toBe(false);
    }
  });
});
