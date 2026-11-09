// The history request inherited a 400-update cap, hiding the start of long
// conversations. Exercise the shipped handler against real ledger reads.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { readItemHistory, _internals } from '../main/store/work-items.mts';

const source = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
const start = source.indexOf("  ipcMain.handle('zero:item-history'");
const end = source.indexOf('\n  });', start) + '\n  });'.length;

it.each([399, 400, 401, 900])('returns all %i updates, including the opening message', async count => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'history-start-'));
  try {
    const ledger = _internals.ledgerPath(root);
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.writeFileSync(ledger, Array.from({length:count}, (_,i) => JSON.stringify({
      id:'w-long', ts:i+1, source:i%2 ? 'agent' : 'founder',
      patch:i === 0 ? {body:'The first message'} : {answer:`Message ${i+1}`},
    })).join('\n')+'\n');
    let handler;
    const store = {readHistory: (_product, id, options) => readItemHistory(root, id, options)};
    new Function('ipcMain', 'store', stripTypeScriptTypes(source.slice(start, end), { mode: 'strip' }))({handle: (_name, fn) => {handler = fn;}}, store);
    const result = await handler(null, {product:'sample', id:'w-long'});
    expect(result.ok).toBe(true);
    expect(result.lines).toHaveLength(count);
    expect(result.lines[0].patch.body).toBe('The first message');
    const before = await handler(null, {product:'sample', id:'w-long', before:200});
    expect(before.lines).toHaveLength(200);
    expect(before.lines.at(-1).ts).toBe(200);
    const missing = await handler(null, {product:'sample', id:'w-missing'});
    expect(missing).toEqual({ok:true, lines:[]});
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
});
