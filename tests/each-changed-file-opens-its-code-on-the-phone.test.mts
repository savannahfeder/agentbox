// EACH CHANGED FILE OPENS ITS CODE ON THE PHONE.
//
// The phone app drew a finished run's change as "+359 −114 in 11 files" and
// one row per file, and none of the rows could be tapped: the thread's copy
// carried only names and counts, never a line of code, so there was nothing
// to open. Reported from an iPhone screenshot, 2026-11-16, and confirmed by
// syncing a thread with a saved change and finding no file for it in the
// thread's list of files.
//
// Now the computer sends the saved change file with the thread's other files,
// under the path the desktop opens it by, and each row opens that file's code.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPhoneUploads } from '../main/phone-uploads.mts';
import { createPhoneInbox } from '../main/phone-inbox.mts';
import { cloudPlaces } from '../renderer/src/cloud-files';
import { fileOnPhone } from '../renderer/src/phone-links';
import { changeKeyOf, changedFileIn, codeLines, computerIdOf } from '../mobile/src/lib/change';

const T = Date.UTC(2026, 10, 16, 13, 46);
const DEVICE = 'a1b2c3d4e5f6';
const ID = 'w-cbbfe73138';
let home: string; let docs: string; let machinery: string;

const SAVED = (h: string) => ({
  item: ID, plus: 3, minus: 1, committed: true, uncommitted: false, knowsYou: true,
  roots: [`${h}/dev/repo`],
  files: [
    { path: 'main/team/sign-in.mts', abs: `${h}/dev/repo/main/team/sign-in.mts`, plus: 2, minus: 1,
      hunks: [{ rows: [['=', 'const a = 1;'], ['-', 'old()'], ['+', 'fresh()'], ['+', 'more()']], nums: [[1, 1], [2, null], [null, 2], [null, 3]], said: 'Now the sign-in.', plus: 2, minus: 1 }] },
    { path: 'main/ipc.mts', abs: `${h}/dev/repo/main/ipc.mts`, plus: 1, minus: 0,
      hunks: [{ rows: [['+', 'export {}']], plus: 1, minus: 0 }] },
  ],
});

beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-change-code-')));
  docs = path.join(home, 'Zero', 'accounts', 'a', 'proj');
  machinery = path.join(home, 'Zero', 'projects', 'proj');
  fs.mkdirSync(docs, { recursive: true });
});

const writeChange = (body: unknown = SAVED(home)) => {
  const f = path.join(machinery, 'runs', ID, 'the-change-it-made.change');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(body));
  return f;
};
const snap = { item: { id: ID, result: 'Done, see the change.', updatedAt: T }, history: [] };

function uploader() {
  const sent: { name: string; data: Buffer; type: string | null }[] = [];
  const up = createPhoneUploads({
    backend: { async putPhoneFile(u) { sent.push(u); }, async dropPhoneFiles() {} },
    owner: 'o', device: DEVICE, state: { uploaded: {} }, save() {}, home, now: () => T,
  });
  return { up, sent };
}

describe('the computer sends a finished run\'s change with its files', () => {
  it('lists it under the path the desktop opens it by, and uploads it with the home folder hidden', async () => {
    const file = writeChange();
    const { up, sent } = uploader();
    const first = up.manifest('t', snap, { dir: docs, updatedAt: T, base: '1', change: { key: changeKeyOf(ID), file } });
    expect(first?.files[`runs/${ID}/the-change-it-made.change`]).toMatchObject({ soon: true });
    await up.kick();
    expect(sent).toHaveLength(1);
    expect(sent[0].name).toMatch(/^[0-9a-f]{64}\.change$/);
    const text = sent[0].data.toString('utf8');
    expect(text).not.toContain(home);
    expect(JSON.parse(text).files[0].hunks[0].rows).toHaveLength(4);
    const again = up.manifest('t', snap, { dir: docs, updatedAt: T, base: '2', change: { key: changeKeyOf(ID), file } });
    expect(again?.files[changeKeyOf(ID)]?.n).toBe(sent[0].name);
  });

  it('sends nothing for a run that saved no change', async () => {
    const { up, sent } = uploader();
    const out = up.manifest('t', snap, { dir: docs, updatedAt: T, base: '1', change: { key: changeKeyOf(ID), file: path.join(machinery, 'runs', ID, 'the-change-it-made.change') } });
    await up.kick();
    expect(out).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it('sends nothing when no change is asked for, even if one is on disk', async () => {
    writeChange();
    const { up, sent } = uploader();
    expect(up.manifest('t', snap, { dir: docs, updatedAt: T, base: '1' })).toBeNull();
    await up.kick();
    expect(sent).toHaveLength(0);
  });
});

describe('a sync from the computer', () => {
  async function sync(withChange: boolean) {
    const file = withChange ? writeChange() : path.join(machinery, 'runs', ID, 'the-change-it-made.change');
    const sent: { snapshot: { attached?: { files?: Record<string, unknown> } } }[] = [];
    const stored = new Map<string, Buffer>();
    const row = { id: ID, title: 'Sign-in fix', status: 'open', result: 'Done.', createdAt: T, updatedAt: T };
    const inbox = createPhoneInbox({
      backend: {
        async putPhoneProject() {}, async dropPhoneThreads() {}, async dropPhoneProject() {},
        async putPhoneThreads(_d: unknown, _p: unknown, batch: typeof sent) { sent.push(...batch); },
        async waitingPhoneCommands() { return []; }, async claimPhoneCommand() { return null; }, async markPhoneCommand() {},
        async putPhoneFile({ name, data }: { name: string; data: Buffer }) { stored.set(name, data); }, async dropPhoneFiles() {},
      } as never,
      owner: 'o', device: DEVICE, home, now: () => T,
      projects: () => [{ slug: 'p', name: 'P', dir: docs }],
      listItems: () => [row], historyOf: () => [], apply: async () => ({}),
      changeFileOf: () => file,
      changeOf: () => (withChange ? { ...SAVED(home), files: SAVED(home).files.map(({ hunks: _h, ...f }) => f) } : null),
      stateFile: path.join(home, 'state.json'),
    });
    await inbox.syncOnce();
    await inbox.filesSettled();
    return { files: sent[0]?.snapshot.attached?.files ?? {}, stored };
  }

  it('lists the change among the thread\'s files and uploads it', async () => {
    const { files, stored } = await sync(true);
    expect(files[changeKeyOf(ID)]).toMatchObject({ soon: true });
    expect([...stored.keys()]).toEqual([expect.stringMatching(/\.change$/)]);
  });

  it('lists nothing when the run saved no change', async () => {
    const { files, stored } = await sync(false);
    expect(files[changeKeyOf(ID)]).toBeUndefined();
    expect(stored.size).toBe(0);
  });
});

describe('the phone finds the change and one file\'s code in it', () => {
  const P = `proj@${DEVICE}`;
  const placesOf = (files: Record<string, unknown>) => cloudPlaces(
    [{ device: DEVICE, project: 'proj', snapshot: { item: { updatedAt: T }, attached: { dir: '~/Zero/accounts/a/proj', files } } }],
    (d, p) => `${p}@${d}`,
  );

  it('opens the uploaded change by its key', () => {
    const n = `${'a'.repeat(64)}.change`;
    const places = placesOf({ [changeKeyOf(ID)]: { n, s: 900 } });
    const links = new Map([[n, { url: 'https://x/change', until: T + 3600_000 }]]);
    expect(fileOnPhone(places, links as never, P, changeKeyOf(ID))).toMatchObject({ ok: true, link: 'https://x/change' });
  });

  it('reads one file\'s rows out of the change by its path', () => {
    const text = JSON.stringify(SAVED('~'));
    const f = changedFileIn(text, 'main/team/sign-in.mts');
    expect(f?.hunks[0].rows.map((r) => r[0])).toEqual(['=', '-', '+', '+']);
    expect(f?.hunks[0].said).toBe('Now the sign-in.');
    expect(changedFileIn(text, 'main/ipc.mts')?.plus).toBe(1);
  });

  it('lays the rows out with the agent\'s sentence above and the new file\'s line numbers', () => {
    const lines = codeLines(changedFileIn(JSON.stringify(SAVED('~')), 'main/team/sign-in.mts')!);
    expect(lines[0]).toMatchObject({ kind: 'said', text: 'Now the sign-in.' });
    expect(lines.slice(1).map((l) => (l.kind === 'row' ? `${l.mark}${l.num}` : l.kind))).toEqual(['=1', '-2', '+2', '+3']);
  });

  it('marks the lines skipped between two hunks, and none when they touch or have no numbers', () => {
    const hunk = (from: number, n: number) => ({ rows: Array.from({ length: n }, () => ['=', 'x'] as ['=', string]), nums: Array.from({ length: n }, (_, i) => [from + i, from + i] as [number, number]) });
    const file = (hunks: unknown[]) => ({ path: 'a', plus: 0, minus: 0, hunks }) as never;
    expect(codeLines(file([hunk(1, 2), hunk(10, 1)])).filter((l) => l.kind === 'skip')).toEqual([{ kind: 'skip', key: '1-skip', lines: 7 }]);
    expect(codeLines(file([hunk(1, 2), hunk(3, 1)])).some((l) => l.kind === 'skip')).toBe(false);
    expect(codeLines(file([{ rows: [['+', 'a']] }, { rows: [['+', 'b']] }])).some((l) => l.kind === 'skip')).toBe(false);
  });

  it('looks the change up by the computer\'s id when the phone shows the thread under a stand-in', () => {
    expect(computerIdOf({ 'w-x~1': { item: ID } }, 'w-x~1')).toBe(ID);
    expect(computerIdOf({}, ID)).toBe(ID);
    expect(computerIdOf(undefined, ID)).toBe(ID);
  });

  it('finds nothing for a path the change does not hold, or text that is not a change', () => {
    expect(changedFileIn(JSON.stringify(SAVED('~')), 'main/team/session.mts')).toBeNull();
    expect(changedFileIn('not json', 'main/ipc.mts')).toBeNull();
    expect(changedFileIn('{"files":"nope"}', 'main/ipc.mts')).toBeNull();
  });
});

describe('the phone\'s change card', () => {
  const parts = fs.readFileSync('mobile/src/ui/ThreadParts.tsx', 'utf8');
  const card = parts.slice(parts.indexOf('export function ChangeCard'), parts.indexOf('export function OptionsCard'));
  it('makes each file row a button that opens its code', () => {
    expect(card).toMatch(/<Pressable[^>]*onPress=\{\(\) => open\(f\.path\)\}/);
    expect(card).toMatch(/accessibilityRole="button"/);
  });
  it('the thread page hands the card where to open from', () => {
    const page = fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8');
    expect(page).toMatch(/<ChangeCard change=\{thread\.change\} product=\{item\.product\} id=\{item\.id\} \/>/);
  });
  it('the code screen exists', () => {
    expect(fs.existsSync('mobile/src/app/change.tsx')).toBe(true);
  });
});
