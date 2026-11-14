// THE TRASH NEVER TAKES A PROJECT'S OWN FILES.
//
// What was wrong (2026-11-14, daily security review): Files offers "Move older
// versions to the Trash" for any file an agent's thread names, and anything in
// the project's folder could go. An agent that wrote `project-v2.json` and named
// both it and `project.json` made the project's settings an "older version":
// one bulk press binned it and the project dropped out of the app. Measured on
// a stand-in store: trash older moved project.json.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mts';

let storeRoot: string; let dir: string; let place: ReturnType<typeof appFilesPlace>; let store: Store; let binned: string[];
const xdg = process.env.XDG_DATA_HOME;

beforeEach(async () => {
  storeRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'trash-own-')));
  process.env.XDG_DATA_HOME = path.join(storeRoot, 'xdg');
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'app');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'app', name: 'App' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  binned = [];
  place = appFilesPlace({ store, accountRoot, storeRoot, trashItem: async (p: string) => { binned.push(p); fs.renameSync(p, path.join(storeRoot, `bin-${binned.length}`)); } });
});
afterEach(() => {
  if (xdg === undefined) delete process.env.XDG_DATA_HOME; else process.env.XDG_DATA_HOME = xdg;
  fs.rmSync(storeRoot, { recursive: true, force: true });
});

type Listed = { key: string; name: string; versions: number; older: number };
async function namedOnAThread(a: string, b: string): Promise<Listed | undefined> {
  const t = store.composeItem('app', { title: 'Config', body: 'x' });
  await disk.updateWorkItem(dir, t.id, { note: `Wrote \`${a}\` and \`${b}\`.` }, { source: 'agent' });
  return (await place.list()).files.find((x) => x.name === a) as unknown as Listed | undefined;
}

describe('moving older versions to the Trash', () => {
  it('leaves the project\'s settings where they are', async () => {
    fs.writeFileSync(path.join(dir, 'project-v2.json'), '{"x":2}');
    const f = await namedOnAThread('project.json', 'project-v2.json');
    if (f) await place.trash({ keys: [f.key], older: true });
    expect(fs.existsSync(path.join(dir, 'project.json'))).toBe(true);
    expect(binned.map((p) => path.basename(p))).not.toContain('project.json');
  });

  it('and its rules', async () => {
    fs.writeFileSync(path.join(dir, 'instructions.md'), '- Ask first.\n');
    fs.writeFileSync(path.join(dir, 'instructions-v2.md'), '- Ship.\n');
    const f = await namedOnAThread('instructions.md', 'instructions-v2.md');
    if (f) await place.trash({ keys: [f.key], older: true });
    expect(fs.readFileSync(path.join(dir, 'instructions.md'), 'utf8')).toBe('- Ask first.\n');
  });

  it('still takes an older version of a document', async () => {
    fs.writeFileSync(path.join(dir, 'plan.md'), 'one');
    await new Promise((r) => setTimeout(r, 20));
    fs.writeFileSync(path.join(dir, 'plan-v2.md'), 'two');
    const f = await namedOnAThread('plan.md', 'plan-v2.md');
    expect(f?.versions).toBe(2);
    await place.trash({ keys: [f!.key], older: true });
    expect(binned.map((p) => path.basename(p))).toContain('plan.md');
    expect(fs.existsSync(path.join(dir, 'plan-v2.md'))).toBe(true);
  });
});
