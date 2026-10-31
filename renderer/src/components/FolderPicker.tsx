// THE FOLDER PICKER THE APP DRAWS ITSELF.
//
// The Mac's own dialog is still what opens in the desktop app, because it is
// better: it has her sidebar, her recents and her search in it. This is what
// opens in a browser tab, where there is no Mac dialog to open.
//
// It is not a fallback with less in it. It walks the same disk, through the
// same process, and hands back the same kind of absolute path. It also does
// one thing the Mac's dialog cannot: it says, on the folder she is standing in,
// whether choosing it would be turned down, so she never presses the button and
// is told no afterwards. See main/folders.mjs for why a tab can do this at all.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { FolderListing } from '../types';

type Props = {
  title?: string;
  startIn?: string | null;
  onPick: (path: string) => void;
  onClose: () => void;
};

/**
 * The picker usually opens on the home folder, which is refused, and a warning
 *  before anything was chosen reads as an error. It waits until the person
 *  has walked somewhere. */
export function pickerNote(listing: Pick<FolderListing, 'refused'> | null, moved: boolean): { refused: string | null; hint: string | null } {
  if (!listing?.refused) return { refused: null, hint: null };
  return moved ? { refused: listing.refused, hint: null } : { refused: null, hint: 'Open the folder your project’s code is in.' };
}

/** A path typed into the field and not yet entered is the one meant. */
export function folderToUse(typed: string, here: string): string {
  return typed.trim() || here;
}

const FolderIcon = () => (
  <svg className="fp-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
    <path d="M1.5 4.5v8h13v-7H7.5L6 4H1.5z" />
  </svg>
);

export default function FolderPicker({ title, startIn, onPick, onClose }: Props) {
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(true);
  const [moved, setMoved] = useState(false);
  // A slow disk or a big folder means two listings can land out of order. Only
  // the newest one may draw.
  const asked = useRef(0);

  const go = useCallback(async (to: string | null, walked = true): Promise<FolderListing | null> => {
    const mine = ++asked.current;
    setBusy(true);
    const next = await api.listFolders(to);
    if (mine !== asked.current) return null;
    setListing(next);
    setTyped(next.at);
    if (walked) setMoved(true);
    setBusy(false);
    return next;
  }, []);

  useEffect(() => { void go(startIn ?? null, false); }, [go, startIn]);

  const here = listing?.at ?? '';
  const canUse = !!here && !listing?.refused && !listing?.unreadable;
  const want = folderToUse(typed, here);
  const note = pickerNote(listing, moved);

  const use = async () => {
    if (busy || !want) return;
    if (want === here) { if (canUse) onPick(here); return; }
    const next = await go(want);
    if (next && !next.refused && !next.unreadable) onPick(next.at);
  };

  return (
    <div className="modal-backdrop fp-backdrop" onClick={onClose}>
      <div
        className="modal fp-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title ?? 'Choose a folder'}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void use();
        }}
      >
        {title && <h2 className="fp-title">{title}</h2>}
        <div className="fp-head">
          <button
            className="fp-up"
            onClick={() => listing?.parent && go(listing.parent)}
            disabled={!listing?.parent || busy}
            title="Up one folder"
            aria-label="Up one folder"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" /></svg>
          </button>
          {/* Typing or pasting a path is the fast way in, and it is the only
              way to reach a folder that is not under the one being shown. */}
          <div className="fp-field">
            <input
              className="fp-path"
              value={typed}
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void go(typed); } }}
              aria-label="Folder path"
            />
          </div>
        </div>

        <div className="fp-list" role="listbox" aria-busy={busy}>
          {listing?.unreadable && <p className="fp-note">{listing.unreadable}</p>}
          {listing && !listing.unreadable && listing.folders.length === 0 && (
            <p className="fp-note">No folders in here.</p>
          )}
          {listing?.folders.map((folder) => (
            <button
              key={folder.path}
              className="fp-row"
              onClick={() => void go(folder.path)}
              onDoubleClick={() => onPick(folder.path)}
            >
              <FolderIcon />
              <span className="fp-name">{folder.name}</span>
            </button>
          ))}
        </div>

        {/* The refusal sits above the button that it disables, so the sentence
            and the thing it is about are in one place. */}
        {note.refused && <p className="fp-refused">{note.refused}</p>}

        <div className="fp-foot">
          <span className="fp-hint">{note.hint ?? ''}</span>
          <button className="fp-cancel" onClick={onClose}>Cancel</button>
          <button className="fp-use" onClick={() => void use()} disabled={busy || (want === here && !canUse)}>Use this folder</button>
        </div>
      </div>
    </div>
  );
}
