// Closing the reply box used to lose the images she had pasted into it.
//
// her typing came back because it is written to disk on every keystroke, and
// her pasted screenshots did not, because they were held only in the open box's
// own React state. The box dies, the images die, and nothing anywhere says they
// existed.
//
// These pin the property the fix has to hold: A DRAFT IS WORDS AND IMAGES, AND
// BOTH SURVIVE THE BOX. They run against the same functions the composer calls
// (renderer/src/components/Focus.tsx opens with readDraft + readDraftAttachments
// and writes with saveDraft + saveDraftAttachments on every change).
import { describe, it, expect } from 'vitest';
import {
  draftKey, draftImagesKey, readDraft, saveDraft, clearDraft, restoreDraft,
  readDraftAttachments, saveDraftAttachments, hasDraft, COMPOSE_DRAFT_MAX_BYTES,
} from '../renderer/src/drafts';

const ITEM = { product: 'agentbox', id: 'w-8a4a9c7795' };
const OTHER = { product: 'agentbox', id: 'w-f3076922cc' };

function fakeStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    keys: () => [...map.keys()],
    size: () => map.size,
  };
}

// A pasted screenshot, as the clipboard hands it over: no path, just bytes.
const pasted = (name, bytes = 40) => ({ name, dataBase64: 'A'.repeat(bytes), image: true });
// A dropped file, which weighs nothing because only its path is kept.
const dropped = (name) => ({ name, srcPath: `/Users/you/Desktop/${name}`, image: false });

describe('her pasted images, through a close and a reopen', () => {
  it('are there when the box opens again', () => {
    const store = fakeStore();
    const shot = pasted('pasted-35385.png');

    // She types and pastes.
    saveDraft(ITEM, 'The border on this looks wrong.', store);
    saveDraftAttachments(ITEM, [shot], store);

    // She closes the box. The composer's own state is gone; only the store is
    // left, which is the whole of what the reopened box gets to read.
    expect(readDraft(ITEM, store)).toBe('The border on this looks wrong.');
    expect(readDraftAttachments(ITEM, store)).toEqual([
      { name: 'pasted-35385.png', dataBase64: shot.dataBase64, srcPath: undefined, image: true },
    ]);
  });

  it('come back with the bytes the thumbnail is drawn from', () => {
    const store = fakeStore();
    saveDraftAttachments(ITEM, [pasted('one.png', 120)], store);
    const [back] = readDraftAttachments(ITEM, store);
    // AttachRow draws `data:image/png;base64,${a.dataBase64}`: no bytes, no
    // thumbnail, and a broken image reads as the app having damaged her paste.
    expect(back.dataBase64).toBe('A'.repeat(120));
    expect(back.image).toBe(true);
  });

  it('keep a dropped file by its path, which weighs nothing', () => {
    const store = fakeStore();
    saveDraftAttachments(ITEM, [dropped('report.pdf')], store);
    expect(readDraftAttachments(ITEM, store)).toEqual([
      { name: 'report.pdf', dataBase64: undefined, srcPath: '/Users/you/Desktop/report.pdf', image: false },
    ]);
  });

  it('keep their order, so the row she comes back to is the row she left', () => {
    const store = fakeStore();
    saveDraftAttachments(ITEM, [pasted('first.png'), pasted('second.png'), dropped('third.txt')], store);
    expect(readDraftAttachments(ITEM, store).map((a) => a.name)).toEqual(['first.png', 'second.png', 'third.txt']);
  });

  it('are one row per thread, never leaking into the next task', () => {
    const store = fakeStore();
    saveDraftAttachments(ITEM, [pasted('mine.png')], store);
    saveDraftAttachments(OTHER, [pasted('theirs.png')], store);
    expect(readDraftAttachments(ITEM, store).map((a) => a.name)).toEqual(['mine.png']);
    expect(readDraftAttachments(OTHER, store).map((a) => a.name)).toEqual(['theirs.png']);
  });

  it('go when she removes them: an empty row is no row, not an empty one', () => {
    const store = fakeStore();
    saveDraftAttachments(ITEM, [pasted('a.png')], store);
    saveDraftAttachments(ITEM, [], store);
    expect(store.getItem(draftImagesKey(ITEM))).toBe(null);
    expect(readDraftAttachments(ITEM, store)).toEqual([]);
  });
});

describe('the words and the images are one draft', () => {
  it('opens the reply box for images alone, with not a word typed', () => {
    const store = fakeStore();
    saveDraftAttachments(ITEM, [pasted('screenshot.png')], store);
    // App.tsx opens the dock on hasDraft. A thread she pasted a screenshot into
    // is as unfinished as one she typed into.
    expect(hasDraft(ITEM, store)).toBe(true);
    expect(readDraft(ITEM, store)).toBe('');
  });

  it('is no draft when there is neither', () => {
    const store = fakeStore();
    expect(hasDraft(ITEM, store)).toBe(false);
    saveDraft(ITEM, '   ', store);
    expect(hasDraft(ITEM, store)).toBe(false);
  });

  it('is taken whole by a send: words and images both', () => {
    const store = fakeStore();
    saveDraft(ITEM, 'Have a look at this.', store);
    saveDraftAttachments(ITEM, [pasted('look.png')], store);

    clearDraft(ITEM, store);  // what send does, after persisting the images

    expect(hasDraft(ITEM, store)).toBe(false);
    expect(store.size()).toBe(0);   // no orphan image row left behind the words
  });

  it('keeps the two under different keys, so nothing she types can be read as an image', () => {
    expect(draftKey(ITEM)).toBe('zero.draft.agentbox:w-8a4a9c7795');
    expect(draftImagesKey(ITEM)).toBe('zero.draftimg.agentbox:w-8a4a9c7795');
    const store = fakeStore();
    // Her words are stored as themselves, even when they look like the record.
    const jsonish = '[{"name":"gotcha.png","dataBase64":"AAA","image":true}]';
    saveDraft(ITEM, jsonish, store);
    expect(readDraft(ITEM, store)).toBe(jsonish);
    expect(readDraftAttachments(ITEM, store)).toEqual([]);
  });
});

describe('a draft cannot fill her disk', () => {
  it('keeps what fits and hands back what does not, in order', () => {
    const store = fakeStore();
    const small = pasted('small.png', 100);
    const huge = pasted('huge.png', COMPOSE_DRAFT_MAX_BYTES + 1);
    const { kept, dropped: over } = saveDraftAttachments(ITEM, [small, huge], store);
    expect(kept.map((a) => a.name)).toEqual(['small.png']);
    expect(over.map((a) => a.name)).toEqual(['huge.png']);
    // Which is what the box says out loud, so the limit is never a silent loss.
    expect(readDraftAttachments(ITEM, store).map((a) => a.name)).toEqual(['small.png']);
  });

  it('takes a real screenshot without complaint', () => {
    const store = fakeStore();
    // A retina screenshot of her window is a few hundred kilobytes; base64 is a
    // third bigger again. One is nowhere near the budget.
    const { kept, dropped: over } = saveDraftAttachments(ITEM, [pasted('window.png', 900_000)], store);
    expect(kept).toHaveLength(1);
    expect(over).toHaveLength(0);
  });

  it('takes the newest paste off first, so the ones she has been looking at survive', () => {
    const store = fakeStore();
    // Two of these fit and three do not.
    const big = Math.floor(COMPOSE_DRAFT_MAX_BYTES * 0.4);
    const { kept, dropped: over } = saveDraftAttachments(
      ITEM, [pasted('oldest.png', big), pasted('middle.png', big), pasted('newest.png', big)], store,
    );
    expect(kept.map((a) => a.name)).toEqual(['oldest.png', 'middle.png']);
    expect(over.map((a) => a.name)).toEqual(['newest.png']);
  });

  it('never drops a file that only carries a path, because it costs nothing', () => {
    const store = fakeStore();
    const { kept, dropped: over } = saveDraftAttachments(
      ITEM, [dropped('notes.pdf'), pasted('huge.png', COMPOSE_DRAFT_MAX_BYTES + 1)], store,
    );
    expect(kept.map((a) => a.name)).toEqual(['notes.pdf']);
    expect(over.map((a) => a.name)).toEqual(['huge.png']);
  });

  it('gives back fewer images rather than none when the store starts refusing', () => {
    // A store with room for one of these two, which is what a nearly full
    // localStorage behaves like.
    const store = fakeStore();
    const plain = store.setItem;
    store.setItem = (k, v) => { if (String(v).length > 700) throw new Error('QuotaExceededError'); plain(k, v); };
    const { kept, dropped: over } = saveDraftAttachments(ITEM, [pasted('first.png', 500), pasted('second.png', 500)], store);
    expect(kept.map((a) => a.name)).toEqual(['first.png']);
    expect(over.map((a) => a.name)).toEqual(['second.png']);
    expect(readDraftAttachments(ITEM, store).map((a) => a.name)).toEqual(['first.png']);
  });

  it('never lets a full disk take her words down with it', () => {
    const full = fakeStore();
    full.setItem = () => { throw new Error('QuotaExceededError'); };
    // The images are refused, and the composer is told so rather than throwing
    // out of the keystroke that would have saved the words.
    const { kept, dropped: over } = saveDraftAttachments(ITEM, [pasted('big.png')], full);
    expect(kept).toEqual([]);
    expect(over.map((a) => a.name)).toEqual(['big.png']);
  });
});

describe('what was already saved before this shipped', () => {
  it('opens a draft written by the old app, which stored a bare string', () => {
    // Every draft sitting in her localStorage right now is a plain string under
    // the words key. Nothing migrates; it simply opens.
    const store = fakeStore({ [draftKey(ITEM)]: 'words I typed yesterday' });
    expect(readDraft(ITEM, store)).toBe('words I typed yesterday');
    expect(readDraftAttachments(ITEM, store)).toEqual([]);
    expect(hasDraft(ITEM, store)).toBe(true);
  });

  it('survives a damaged or half-written image row', () => {
    const store = fakeStore({ [draftImagesKey(ITEM)]: '{not json' });
    expect(readDraftAttachments(ITEM, store)).toEqual([]);
    expect(hasDraft(ITEM, store)).toBe(false);
  });

  it('drops an entry with neither bytes nor a path rather than drawing a broken thumb', () => {
    const store = fakeStore({
      [draftImagesKey(ITEM)]: JSON.stringify([{ name: 'ghost.png', image: true }, pasted('real.png')]),
    });
    expect(readDraftAttachments(ITEM, store).map((a) => a.name)).toEqual(['real.png']);
  });
});

// Undo used to hand back the body that went out, which is her words with
// `![pasted-3347.png](attachments/…)` appended, so the box reopened with a
// markdown link typed where her screenshot had been. The rule these pin: Z
// REOPENS THE BOX SHE WAS LOOKING AT, thumbnail and all.
describe('the undo of a send gives back the box, not the message', () => {
  it('puts her words back without the markdown the send appended', () => {
    const store = fakeStore();
    saveDraft(ITEM, 'Have a look at this.', store);
    saveDraftAttachments(ITEM, [pasted('look.png')], store);
    clearDraft(ITEM, store); // she sends

    // What the composer kept: the words before the join, and the staged file.
    expect(restoreDraft(ITEM, 'Have a look at this.', [pasted('look.png')], store)).toBe(true);
    expect(readDraft(ITEM, store)).toBe('Have a look at this.');
    expect(readDraft(ITEM, store)).not.toContain('attachments/');
  });

  it('puts the image back as an image, so the box draws the thumbnail again', () => {
    const store = fakeStore();
    const shot = pasted('look.png');
    saveDraft(ITEM, 'Have a look at this.', store);
    saveDraftAttachments(ITEM, [shot], store);
    clearDraft(ITEM, store);

    restoreDraft(ITEM, 'Have a look at this.', [shot], store);
    const back = readDraftAttachments(ITEM, store);
    expect(back).toHaveLength(1);
    expect(back[0].name).toBe('look.png');
    expect(back[0].image).toBe(true);
    expect(back[0].dataBase64 ?? back[0].srcPath).toBeTruthy();
  });

  it('brings back a screenshot she sent with no words at all', () => {
    // hasDraft has always said an image alone is a draft. The restore used to
    // disagree, return false, and the toast said nothing was sent.
    const store = fakeStore();
    expect(restoreDraft(ITEM, '', [pasted('look.png')], store)).toBe(true);
    expect(readDraftAttachments(ITEM, store)).toHaveLength(1);
    expect(hasDraft(ITEM, store)).toBe(true);
  });

  it('still declines when she has started typing again', () => {
    const store = fakeStore();
    saveDraft(ITEM, 'the new thing I am writing now', store);
    expect(restoreDraft(ITEM, 'the older thing I sent', [pasted('look.png')], store)).toBe(false);
    expect(readDraft(ITEM, store)).toBe('the new thing I am writing now');
    expect(readDraftAttachments(ITEM, store)).toEqual([]);
  });

  it('declines on a screenshot she has pasted since, which is just as much a draft', () => {
    const store = fakeStore();
    saveDraftAttachments(ITEM, [pasted('the-new-one.png')], store);
    expect(restoreDraft(ITEM, 'the older thing I sent', [pasted('look.png')], store)).toBe(false);
    expect(readDraftAttachments(ITEM, store).map((a) => a.name)).toEqual(['the-new-one.png']);
    expect(readDraft(ITEM, store)).toBe('');
  });

  it('returns false and writes nothing when there was nothing to give back', () => {
    const store = fakeStore();
    expect(restoreDraft(ITEM, '', [], store)).toBe(false);
    expect(store.size()).toBe(0);
  });
});
