import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import { viewKind } from '../../../shared/artifact-marks.mts';

/** Whether autolink may make a typed word a link: `readme.md` and `run.py` are files, not Moldova and Paraguay. */
export function linksAsAddress(word: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(word)) return true;
  const host = (word.includes('@') ? word.split('@').pop() ?? '' : word).split(/[/?#:]/)[0];
  if (!host.includes('.') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return !viewKind(host);
}

/** A change made by the person at this editor, not words the app put in: a load (setContent) or the live room's sync. */
export const isTypedHere = (tr: Pick<Transaction, 'getMeta'>): boolean =>
  tr.getMeta('preventUpdate') === undefined && !tr.getMeta(ySyncPluginKey);

/** What a sitting with a document writes back: nothing until someone changed it. */
export const wordsTheyChanged = ({ touched, baseline, now }: { touched: boolean; baseline: string; now: string }): string | null =>
  touched && now !== baseline ? now : null;

// Autolink reads every changed block, so a whole file loaded at once had its
// first line's last word linked, and that edit was then saved as someone's.
export const LinksOnlyAsYouType = Extension.create({
  name: 'linksOnlyAsYouType',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('linksOnlyAsYouType'),
      filterTransaction: (tr) => {
        if (!isTypedHere(tr)) tr.setMeta('preventAutolink', true);
        return true;
      },
    })];
  },
});
