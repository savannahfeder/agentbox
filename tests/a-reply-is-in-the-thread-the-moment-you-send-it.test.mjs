// A REPLY IS IN THE THREAD THE MOMENT YOU SEND IT, WHEREVER THE SEND TAKES YOU
// (w-388be0a968).
//
// "there is a second where nothing shows up. You just see the thread itself as
// if you'd never sent a message, and then your message just appears out of
// the blue."
//
// fc3cf538 drew a reply at once only when it kept you on the thread. A reply
// from Needs you moves you on to the next task, and pressing O to follow it
// back opened a thread with no sign of it: measured on the browser copy, the
// words appeared 3,116 ms after O, when the undo window ran out and the write
// landed. Picking an option (1 to 9) drew nothing at once on any path.
//
// With that fixed, timing every frame after O showed one more fault: the
// first frame of the thread drew the previous thread's messages under the new
// thread's header, with your reply at the bottom of them. The conversation was
// emptied by an effect, which runs after that frame is painted.
//
// Pinned here: both sends put their words in the `sending` queue before the
// undo window, whether or not you stay, and take them off when Z takes the
// send back or once the written copy has landed; and a thread never draws
// messages read for another thread.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { itemThread } from '../renderer/src/item-thread.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const pane = fs.readFileSync(new URL('../renderer/src/components/ItemThread.tsx', import.meta.url), 'utf8');

describe('the conversation on a thread just opened', () => {
  it('draws only messages read for this thread', () => {
    expect(pane).toMatch(/const rowKey = `\$\{item\.product\}\\n\$\{item\.id\}`;/);
    expect(pane).toMatch(/const ledger = loaded\?\.key === rowKey \? loaded : null;/);
    expect(pane.indexOf('const ledger = loaded?.key === rowKey')).toBeLessThan(pane.indexOf('if (!ledger) return <ThreadWaiting'));
  });

  it('stamps every read with the thread it was read for, the failed one too', () => {
    const sets = pane.match(/setLedger\(\{[^}]*\}/g) ?? [];
    expect(sets).toHaveLength(2);
    for (const set of sets) expect(set).toMatch(/^setLedger\(\{ key: rowKey, /);
  });
});
const typed = app.slice(app.indexOf('// A REPLY IN A CONVERSATION IS ON THE SCREEN WHEN SHE SENDS IT'), app.indexOf('/* ------------------------ answering one of her agents'));
const picked = app.slice(app.indexOf('const pickOption = useCallback('), app.indexOf('/* ------------------------ the task she just wrote'));

describe('a typed reply', () => {
  it('is drawn whether or not the send keeps you on the thread', () => {
    expect(typed).toMatch(/^\s*setSending\(\(q\) => \[\.\.\.q, mine\]\);/m);
    expect(typed).not.toMatch(/if \(stay\) setSending\(\(q\) => \[\.\.\.q, mine\]\)/);
    expect(typed.indexOf('setSending((q) => [...q, mine])')).toBeLessThan(typed.indexOf('await deferCommit('));
  });

  it('is let go once it has landed, whether or not you stayed', () => {
    expect(typed).toMatch(/^\s*setTimeout\(\(\) => setSending\(\(q\) => q\.filter\(\(s\) => s !== mine\)\), LANDED_MS\);/m);
    expect(typed).not.toMatch(/if \(stay\) setTimeout\(\(\) => setSending/);
  });
});

describe('a picked option', () => {
  it('is drawn in the words the ledger will hold, before the undo window', () => {
    expect(picked).toMatch(/const answer = `Option \$\{option\.n\}: \$\{option\.text\}`/);
    expect(picked).toMatch(/text: answer, held: holdsReplies\(onPhone\(\)\)/);
    expect(picked).toMatch(/answer, \.\.\.\(status \? \{ status \} : \{\}\)/);
    expect(picked.indexOf('setSending((q) => [...q, mine])')).toBeGreaterThan(-1);
    expect(picked.indexOf('setSending((q) => [...q, mine])')).toBeLessThan(picked.indexOf('await deferCommit('));
  });

  it('comes off when Z takes it back, inside the window or after it, or when the write fails', () => {
    const letGo = 'const letGo = () => setSending((q) => q.filter((s) => s !== mine));';
    expect(picked).toContain(letGo);
    // The window's restore, the later undo's restore, and the failed write.
    expect(picked).toContain('const takeBack = (): Restored => { letGo(); return null; };');
    expect(picked).toContain('restore: takeBack,');
    expect(picked).toMatch(/`, takeBack, !movesOn\(item\),/);
    expect(picked).toMatch(/catch \(error\) \{ letGo\(\); throw error; \}/);
    expect(picked).toMatch(/setTimeout\(letGo, LANDED_MS\)/);
  });

  const T = 1_800_000_000_000;
  const text = 'Option 1: Ship it (recommended)';
  const ledger = [
    { id: 'w-1', ts: T, source: 'founder', patch: { title: 'Fix it', body: 'Fix it', status: 'open' } },
    { id: 'w-1', ts: T + 60_000, source: 'agent', patch: { result: 'Done.\n\n## Options\n1. Ship it (recommended)\n2. Throw it away', status: 'open' } },
    { id: 'w-1', ts: T + 123_100, source: 'founder', patch: { answer: text, status: 'open' } },
  ];
  const pending = [{ at: T + 120_000, text, held: true }];
  const picks = (thread) => thread.events.filter((e) => e.verb === 'You picked option 1');

  it('is drawn as the line the written pick will be, before the ledger has it', () => {
    const before = itemThread(ledger.slice(0, 2), [], null, { pending });
    expect(before.events.at(-1)).toMatchObject({ kind: 'work', verb: 'You picked option 1', subject: 'Ship it', yours: true });
    expect(before.events.some((e) => e.text === text)).toBe(false);
    // It answers the agent, so the agent's word is no longer the last one.
    expect(before.outcome).toBeNull();
  });

  it('is drawn once after the write lands, and looks the same as before it', () => {
    const before = picks(itemThread(ledger.slice(0, 2), [], null, { pending }));
    const after = picks(itemThread(ledger, [], null, { pending }));
    expect(after).toHaveLength(1);
    expect({ ...after[0], at: 0 }).toEqual({ ...before[0], at: 0 });
  });

  it('does not take a typed reply that starts the same way for a pick', () => {
    const long = 'Option 1: Ship it\nbut rename the button first';
    const drawn = itemThread(ledger.slice(0, 2), [], null, { pending: [{ at: T + 120_000, text: long }] });
    expect(drawn.events.at(-1)).toMatchObject({ who: 'you', text: long, pending: true });
  });

  it('a different option already picked does not swallow the new one', () => {
    const earlier = [...ledger.slice(0, 2), { id: 'w-1', ts: T + 121_000, source: 'founder', patch: { answer: 'Option 2: Throw it away' } }];
    const drawn = itemThread(earlier, [], null, { pending });
    expect(picks(drawn)).toHaveLength(1);
    expect(drawn.events.filter((e) => e.verb === 'You picked option 2')).toHaveLength(1);
  });
});
