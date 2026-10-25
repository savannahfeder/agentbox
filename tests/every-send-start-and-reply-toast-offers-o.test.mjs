// EVERY TOAST AFTER A SEND, A START OR A REPLY OFFERS O, AND Z WHEN THERE IS ONE.
//
// w-5513afd09a: "normally when I send, start agent threads, or reply to them,
// I can hit O to see them. Sometimes the toast just doesn't have that
// information. It's just a simple toast without the ability to follow through
// ... Most of those times I do want to follow through and I can't. Or Z to
// undo etc"
//
// Measured before the fix, by reading every showToast in App.tsx that follows
// a send, a start or a reply: a new thread and an answered row carried O, and
// these did not:
//   - a message to a teammate ("Sent to Ana"), no O;
//   - a new repeating task ("Repeating → X · Z to undo"), no O, and Z promised
//     even when no rule came back to undo;
//   - a reply to one of your own outside agents ("Sent → name"), no O, and no
//     Z drawn although Z did take it back;
//   - Run now, Restart, Back in the queue and Resume, no O;
//   - any reply that kept you on the thread, no O once you left it, because
//     deferCommit dropped the destination whenever `stay` was set.
// Two of them (a plain toast) also faded in 2.5 s rather than 6.
//
// The rule is pure (renderer/src/toast-parts.ts). The wiring is checked by
// excerpt, the way the other toast tests do it, because there is no render
// harness for App.tsx.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { opensTheToast, toastOpens } from '../renderer/src/toast-parts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const ipc = fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8');

const goes = { product: 'agentbox', id: 'w-1' };

// The body of one `const name = useCallback(` in App.tsx, up to the next one.
function handler(name) {
  const at = app.indexOf(`const ${name} = useCallback(`);
  expect(at, `${name} is in App.tsx`).toBeGreaterThan(-1);
  const next = app.indexOf('= useCallback(', at + 30);
  return app.slice(at, next === -1 ? undefined : next);
}

describe('O is offered unless you are already looking at it', () => {
  it('from the list, O opens it', () => {
    expect(toastOpens({ goes }, null)).toBe(true);
    expect(opensTheToast('o', { goes }, null)).toEqual(goes);
  });

  it('from another thread, O opens it', () => {
    const other = { product: 'agentbox', id: 'w-2' };
    expect(toastOpens({ goes }, other)).toBe(true);
    expect(opensTheToast('o', { goes }, other)).toEqual(goes);
  });

  it('the same id in another project is another thread', () => {
    const elsewhere = { product: 'kestrel', id: 'w-1' };
    expect(toastOpens({ goes }, elsewhere)).toBe(true);
  });

  it('on the thread it names, no O: you are already there', () => {
    // A reply that keeps you on the thread names it now, so that O works
    // the moment you leave; while you are on it the cap would be a no-op.
    expect(toastOpens({ goes }, { ...goes })).toBe(false);
    expect(opensTheToast('o', { goes }, { ...goes })).toBeNull();
  });

  it('a toast with nowhere to go still opens nothing', () => {
    expect(toastOpens({}, null)).toBe(false);
    expect(toastOpens(null, null)).toBe(false);
    expect(opensTheToast('o', {}, null)).toBeNull();
  });

  it('a repeating task is never the thread you have open, even with the same id', () => {
    const rule = { ...goes, repeat: true };
    expect(toastOpens({ goes: rule }, { ...goes })).toBe(true);
  });
});

describe('every send, start and reply names where it went', () => {
  it('a reply that keeps you on the thread still names it', () => {
    const body = handler('deferCommit');
    expect(body).toContain('showToast(`${toast} · press Z to undo`, goes && { ...goes, sent: true });');
    expect(body).not.toContain('stay ? undefined : goes');
  });

  it('a message to a teammate names the conversation', () => {
    expect(app).toMatch(/showToast\(said \? `Sent to \$\{said\}` : 'Message sent', how\.made \?/);
  });

  it('the computer says which conversation a message went into', () => {
    expect(ipc).toContain("ipcMain.handle('zero:team-message', teamCall(");
    expect(ipc).toMatch(/made: \{ product: got\.product, id: got\.id \}/);
  });

  it('a new repeating task opens the repeating task, and promises Z only when it can keep it', () => {
    expect(app).toContain("showToast(how.ruleId ? `Repeating → ${to ?? slug} · Z to undo` : `Repeating → ${to ?? slug}`,");
    expect(app).toMatch(/how\.ruleId \? \{ product: slug, id: how\.ruleId, repeat: true \} : undefined\)/);
  });

  it('a reply to your own outside agent names its row and draws Z', () => {
    const body = handler('replyToAgent');
    expect(body).toContain('const back = { product: item.product, id: item.id };');
    expect(body).toMatch(/showToast\(`\$\{agent\.name\} is working on it\$\{z\}`, back\)/);
    expect(body).toMatch(/showToast\(`Sent → \$\{agent\.name\}\$\{z\}`, back\)/);
  });

  it('a reply that did not get through names nothing to open', () => {
    // A failed hand-over has nowhere new to go and nothing to undo.
    const body = handler('replyToAgent');
    expect(body).toContain("if (!out?.ok) showToast(out?.reason ?? 'The message could not be handed over.');");
  });

  it('Back in the queue names the thread', () => {
    expect(handler('sendBack')).toContain('showToast(`Back in the queue → ${item.productName}`, { product: item.product, id: item.id });');
  });

  it('Run now and Restart name the thread when it started, and nothing on a refusal', () => {
    // "Already running." and the other refusals are announcements.
    expect(handler('runNow')).toContain("r?.ok ? { product: item.product, id: item.id } : undefined");
    expect(handler('redeliver')).toContain("r?.ok ? { product: item.product, id: item.id } : undefined");
  });

  it('Resume names the thread when it put one agent back on one thread', () => {
    const body = handler('putAgentBackOn');
    expect(body).toContain('list.length === 1 && (started || queued) ? { product: list[0].product, id: list[0].id } : undefined');
  });
});

describe('the toast draws O by the same rule the key uses', () => {
  it('the cap, the clock and the key all ask toastOpens / opensTheToast with the open thread', () => {
    expect(app).toContain('const here = focused ? { product: focused.product, id: focused.id } : null;');
    expect(app).toContain('const opens = toastOpens(toast, here);');
    expect(app).toContain('{opens && <span className="toast-key"><kbd>O</kbd><span className="toast-key-word">Open</span></span>}');
    expect(app).toContain('const goesTo = opensTheToast(e.key, toast, focused ? { product: focused.product, id: focused.id } : null);');
  });

  it('O on a repeating task opens it the way the Later list does', () => {
    const body = handler('openToastRow');
    expect(body).toContain('if (to.repeat) {');
    expect(body).toContain('openRepeatRef.current?.(rule)');
    expect(app).toContain('openRepeatRef.current = openRepeat;');
  });
});
