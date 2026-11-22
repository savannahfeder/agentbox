// THE SHARE PANEL OFFERS EDIT ONLY WHERE A FILE CAN BE EDITED, AND SAYS WHO A LINK IS FOR.
//
// Asked for 2026-11-12 (w-926a6814a5): the Share panel gained a choice of who
// can open a link and what they can do. A page, a picture or a PDF cannot be
// edited on its page, so offering "can edit" there would promise what the link
// cannot do. Measured on the panel's level picker as it renders, and on the
// words the panel and its button say.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CanPick } from '../renderer/src/components/ShareLink.tsx';
import { shareWords } from '../renderer/src/public-link-words.ts';

const pick = (props: Partial<Parameters<typeof CanPick>[0]>) => renderToStaticMarkup(h(CanPick, { value: 'comment', editable: true, onPick() {}, label: 'x', ...props }));

describe('the level picker', () => {
  it('offers view, comment and edit on a document or a table', () => {
    expect(pick({}).match(/<option value="(\w+)"/g)).toEqual(['<option value="view"', '<option value="comment"', '<option value="edit"']);
  });
  it('leaves edit out where the file cannot be edited', () => {
    expect(pick({ editable: false })).not.toContain('value="edit"');
  });
  it('still shows edit for a person already given it, so the list does not lie about them', () => {
    expect(pick({ editable: false, value: 'edit' })).toContain('value="edit"');
  });
  it('offers Remove on a person\'s line and nowhere else', () => {
    expect(pick({ remove: true })).toContain('>Remove<');
    expect(pick({})).not.toContain('Remove');
  });
});

describe('the words', () => {
  it('name the two ways a link can be open, and the three levels, plainly', () => {
    expect(shareWords.access).toEqual({ anyone: 'Anyone with the link', people: 'Only people added' });
    expect(Object.values(shareWords.can)).toEqual(['can view', 'can comment', 'can edit']);
  });
  it('say who edited the link last, with the time today and the day before', () => {
    const now = new Date(2026, 10, 12, 18, 0).getTime();
    expect(shareWords.editedBy('Theo', { updatedAt: new Date(2026, 10, 12, 17, 2).getTime() }, now)).toMatch(/^Edited by Theo today at /);
    expect(shareWords.editedBy('Theo', { updatedAt: new Date(2026, 10, 3, 9, 0).getTime() }, now)).toBe('Edited by Theo Nov 3');
  });
  // Asked the same day: pressing Stop sharing only changed the button's words, so it was not clear it stopped.
  it('ask before stopping, saying what stopping does and that its comments stay in the thread', () => {
    expect(shareWords.stopConfirm(0)).toBe('Stop sharing? The link stops working for everyone.');
    expect(shareWords.stopConfirm(1)).toBe('Stop sharing? The link stops working for everyone. Its comment stays in the thread.');
    expect(shareWords.stopConfirm(3)).toBe('Stop sharing? The link stops working for everyone. Its comments stay in the thread.');
  });
  // Asked the same day: once the panel shut, the shared globe looked like every other mark.
  it('put the word Shared on the mark of a shared file, drawn as a rounded button in both headers', () => {
    const css = fs.readFileSync(new URL('../renderer/src/components/artifact-view.css', import.meta.url), 'utf8');
    const src = fs.readFileSync(new URL('../renderer/src/components/ShareLink.tsx', import.meta.url), 'utf8');
    expect(shareWords.sharedMark).toBe('Shared');
    expect(src).toMatch(/link && <span>\{shareWords\.sharedMark\}<\/span>/);
    expect(css).toMatch(/:root\[data-code-review\] \.workspace-layout \.doc-marks \.doc-mark\.av-share-on \{[^}]*border-radius: var\(--pill\)/);
  });
  it('call a link kept to certain people private, not public', () => {
    expect(shareWords.kept).toBe('Private link');
    expect(shareWords.live).toBe('Public link');
  });
});
