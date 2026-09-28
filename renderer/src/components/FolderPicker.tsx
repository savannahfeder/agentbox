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
  startIn?: string | null;
  onPick: (path: string) => void;
  onClose: () => void;
};

/** `/Users/you/dev/house` reads as `~/dev/house` when it is under her home. */
function shortPath(at: string, home: string): string {
  if (!home || !at.startsWith(home)) return at;
  return at === home ? '~' : `~${at.slice(home.length)}`;
}

export default function FolderPicker({ startIn, onPick, onClose }: Props) {
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(true);
  // A slow disk or a big folder means two listings can land out of order. Only
  // the newest one may draw.
  const asked = useRef(0);

  const go = useCallback(async (to: string | null) => {
    const mine = ++asked.current;
    setBusy(true);
    const next = await api.listFolders(to);
    if (mine !== asked.current) return;
    setListing(next);
    setTyped(next.at);
    setBusy(false);
  }, []);

  useEffect(() => { void go(startIn ?? null); }, [go, startIn]);

  const here = listing?.at ?? '';
  const home = listing?.home ?? '';
  const canUse = !!here && !listing?.refused && !listing?.unreadable;

  const use = () => { if (canUse) onPick(here); };

  return (
    <div className="modal-backdrop fp-backdrop" onClick={onClose}>
      <div
        className="modal fp-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Choose a folder"
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') use();
        }}
      >
        <div className="fp-head">
          <button
            className="fp-up"
            onClick={() => listing?.parent && go(listing.parent)}
            disabled={!listing?.parent || busy}
            title="Up one folder"
          >
            Up
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
              {folder.name}
            </button>
          ))}
        </div>

        {/* The refusal sits above the button that it disables, so the sentence
            and the thing it is about are in one place. */}
        {listing?.refused && <p className="fp-refused">{listing.refused}</p>}

        <div className="fp-foot">
          <span className="fp-where">{here ? shortPath(here, home) : ''}</span>
          <button className="fp-cancel" onClick={onClose}>Cancel</button>
          <button className="fp-use" onClick={use} disabled={!canUse}>Use this folder</button>
        </div>
      </div>
    </div>
  );
}
