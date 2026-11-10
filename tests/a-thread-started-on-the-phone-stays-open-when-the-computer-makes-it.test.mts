// A THREAD STARTED ON THE PHONE STAYS OPEN WHEN THE COMPUTER MAKES IT.
//
// The founder, 2026-11-08, on App Store build 20 with the demo account: "When
// I type in 'hello testing,' it just says 'queued' and looks stuck there. It
// then says, 'This thread is not on your phone,' and it jumps back and forth."
// Measured in the database: the review computer took the command in 12
// seconds and its copy of the thread reached the phone 20 seconds later. The
// phone shows a new thread under an id made from its command
// (madeHere(command id)); the computer makes the thread under an id of its
// own, and nothing in the phone's copy said which command made it. Once the
// command was marked done, the stand-in went and the open screen had nothing.
// Now the copy carries `fromPhone`, and a screen open on the stand-in follows
// it to the real thread; a copy made before that is matched by project, title
// and time.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { madeHere, threadSnapshot } from '../shared/phone-snapshot.mts';
import { madeThreadOf, phoneSlug } from '../renderer/src/phone-rows';

const DEVICE = 'dev1';
const CMD = '7f7dba40-8925-4e7d-bfd3-8506ab780a48';
const command = (over = {}) => ({ id: CMD, device: DEVICE, project: 'demo', item: null, kind: 'new', payload: { title: 'Hello testing', body: '' }, created_at: '2026-11-08T23:20:49.000Z', taken_at: '2026-11-08T23:21:01.000Z', outcome: 'done', ...over });
const thread = (item, snap = {}) => ({ device: DEVICE, project: 'demo', item, snapshot: { item: { id: item, title: 'Hello testing', createdAt: Date.parse('2026-11-08T23:21:00.000Z'), ...snap } } });
const rows = (commands, threads) => ({ projects: [{ device: DEVICE, project: 'demo', name: 'Demo' }], commands, threads });
const slug = phoneSlug(DEVICE, 'demo');

describe('following a thread started on the phone', () => {
  it('finds the thread the computer made, by the command its copy names', () => {
    const r = rows([command()], [thread('w-ee266915b0', { fromPhone: CMD, title: 'Something else' })]);
    expect(madeThreadOf(r, slug, madeHere(CMD))).toBe('w-ee266915b0');
  });
  it('a copy from before copies named their command is matched by project, title and time', () => {
    const r = rows([command()], [thread('w-91a1996b49', { title: 'Ember', createdAt: Date.parse('2026-11-08T22:31:00Z') }), thread('w-ee266915b0')]);
    expect(madeThreadOf(r, slug, madeHere(CMD))).toBe('w-ee266915b0');
  });
  it('nothing while the computer has not taken it', () => {
    const r = rows([command({ taken_at: null, outcome: null })], [thread('w-ee266915b0', { fromPhone: CMD })]);
    expect(madeThreadOf(r, slug, madeHere(CMD))).toBeNull();
  });
  it('never a thread older than the command, or with another title', () => {
    expect(madeThreadOf(rows([command()], [thread('w-old', { createdAt: Date.parse('2026-11-08T20:00:00Z') })]), slug, madeHere(CMD))).toBeNull();
    expect(madeThreadOf(rows([command()], [thread('w-other', { title: 'Another thing' })]), slug, madeHere(CMD))).toBeNull();
  });
  it('never across projects, and never for an id no command made', () => {
    expect(madeThreadOf(rows([command()], [{ ...thread('w-ee266915b0', { fromPhone: CMD }), project: 'other' }]), slug, madeHere(CMD))).toBeNull();
    expect(madeThreadOf(rows([command()], [thread('w-ee266915b0', { fromPhone: CMD })]), slug, 'w-nothing')).toBeNull();
  });
});

describe('the computer', () => {
  it("puts the command that made a thread into the phone's copy", () => {
    expect(threadSnapshot({ id: 'w-1', title: 'Hello', fromPhone: CMD }).item.fromPhone).toBe(CMD);
  });
});

describe('the thread screen', () => {
  it('moves from the stand-in to the real thread instead of saying it is not on the phone', () => {
    const screen = fs.readFileSync(new URL('../mobile/src/app/thread/[product]/[id].tsx', import.meta.url), 'utf8');
    expect(screen).toMatch(/madeThreadOf\(c\.rows, String\(product\), String\(id\)\)/);
    expect(screen).toMatch(/router\.replace\(\{ pathname: '\/thread\/\[product\]\/\[id\]', params: \{ product: String\(product\), id: made \} \}\)/);
  });
});
