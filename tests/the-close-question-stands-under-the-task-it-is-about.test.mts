// THE CLOSE QUESTION STANDS UNDER THE TASK IT IS ABOUT (w-66748120f2).
//
// "when it does this idk how to find the missing thread, bad ux". Pressing E on
// a long thread raised "Before this closes: one task it filed has not started."
// at the foot and nothing else. The task's own row sits on the turn that filed
// it, which was folded behind "Show 8 earlier messages" in a built copy of the
// app with that thread's shape, so nothing on screen said which task or where.
//
// Now a close unfolds the thread and draws the question right under the list
// holding the waiting task, with the screen brought to it. Full screen has no
// conversation on screen, so there the question names the tasks itself.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { closeAsk } from '../renderer/src/close-asks-first.ts';
import { askTurnOf } from '../renderer/src/filed-in-thread.ts';
import { OptionsOffer } from '../renderer/src/components/OptionsOffer.tsx';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const waits = (id) => ({ id, approve: true });
const ran = (id) => ({ id, approve: false });
const made = (onTurn, atFoot = []) => ({ onTurn: new Map(onTurn), atFoot });

describe('which list the question stands under', () => {
  it('the turn that filed the waiting task, however far up', () => {
    expect(askTurnOf(made([[3, [waits('a')]]]))).toBe(3);
  });

  it('the newest such turn when tasks wait on several', () => {
    expect(askTurnOf(made([[3, [waits('a')]], [9, [waits('b')]], [6, [ran('c')]]]))).toBe(9);
  });

  it('not a turn whose tasks have all started', () => {
    expect(askTurnOf(made([[3, [waits('a')]], [9, [ran('b')]]]))).toBe(3);
  });

  it('the foot when the waiting task belongs to the newest turn', () => {
    expect(askTurnOf(made([[3, [waits('a')]]], [waits('b')]))).toBe(-1);
  });

  it('the foot when no list holds a waiting task', () => {
    expect(askTurnOf(made([[3, [ran('a')]]]))).toBe(-1);
    expect(askTurnOf(made([]))).toBe(-1);
  });
});

describe('how the conversation draws it', () => {
  const thread = read('renderer/src/components/ItemThread.tsx');

  it('unfolds the earlier messages whenever a close raises it', () => {
    expect(thread).toContain('useEffect(() => { if (closeAsk) { setEarlierOpen(true); setWhole(true); } }, [!!closeAsk, closeAsk?.raised]);');
  });

  it('draws it after that turn\'s list, and at the foot when the turn is not drawn', () => {
    expect(thread).toContain('const askTurn = closeAsk ? askTurnOf(made) : -1;');
    expect(thread).toContain('const ask = at === askTurn ? askHere : null;');
    expect(thread).toContain('{askTurn < Math.max(from, 0) && askHere}');
  });
});

describe('where the pane puts it', () => {
  const focus = read('renderer/src/components/Focus.tsx');

  it('hands it to the conversation when it is about filed tasks', () => {
    expect(focus).toContain('const askAtTask = !!closeAsk?.named?.length && !made && !agent && !fullScreenDoc;');
    expect(focus).toContain('closeAsk={askAtTask && closeAsk ? { strip: closeAskStrip(false), raised: closeAsk.raised } : null}');
  });

  it('names the tasks in the strip only in full screen, where the list is not on screen', () => {
    expect(focus).toContain('{fullScreenDoc && closeAskStrip(true)}');
    expect(focus).toContain('{!fullScreenDoc && !askAtTask && closeAskStrip(false)}');
  });
});

describe('the strip naming its tasks, in full screen', () => {
  const strip = (extra) => {
    const ask = closeAsk(1);
    return renderToStaticMarkup(React.createElement(OptionsOffer, {
      ask: ask.ask, askAll: ask.ask, options: ask.options, peekOption: null, askPeek: false,
      selectedOption: null, selRef: { current: null }, onPick: () => {},
      onOptionEnter: () => {}, onAskEnter: () => {}, setPeek: () => {}, setAskPeek: () => {}, ...extra,
    }));
  };

  it('draws each waiting task by its title, between the question and the options', () => {
    const html = strip({ named: { rows: [{ id: 'w-k1', title: 'The Later tab is slow' }], onOpen: () => {} } });
    const at = html.indexOf('The Later tab is slow');
    expect(at).toBeGreaterThan(html.indexOf('Before this thread closes'));
    expect(at).toBeLessThan(html.indexOf('Start the task in a new thread'));
  });

  it('draws nothing extra when no task is named', () => {
    expect(strip({})).not.toContain('opt-named');
    expect(strip({ named: { rows: [], onOpen: () => {} } })).not.toContain('opt-named');
  });

  it('opens the task it names on a click', () => {
    expect(read('renderer/src/components/OptionsOffer.tsx')).toMatch(/className="opt-named-row"[^>]*onClick=\{\(\) => named\.onOpen\(r\.id\)\}/);
  });
});

describe('the phone, which asks in the same words', () => {
  it('keeps the thread open on 3 instead of starting or closing anything', () => {
    const phone = read('mobile/src/app/thread/[product]/[id].tsx');
    expect(phone).toContain("if (option.act === 'keep') return;");
    expect(phone).not.toContain('KEEP_OPEN');
  });
});
