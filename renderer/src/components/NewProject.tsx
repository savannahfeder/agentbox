// THE NEW PROJECT CARD. The drawing it is built from is
// `designs/2026-08-16-the-new-project-card.html`.
//
// The card before it asked three things in sixty words. This one is the NEW
// TASK CARD's shape: one thing you type, one sentence underneath, one button.
// Eleven words.
//
// So NOTHING HERE IS PASTED. The folder is proposed from the name typed and
// made on Make it; the dotted words open the Mac's own chooser, whose New
// Folder button covers making a brand-new folder and costs us no
// interface. The word on this card is PROJECT everywhere.
//
// IN A BROWSER TAB THERE IS NO MAC CHOOSER, so the dotted words open
// <FolderPicker> instead, which walks the same disk through the same process
// and hands back the same kind of path. The card does not know or care which
// one it got: `browse` comes back from main and this opens the other one.

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import FolderPicker from './FolderPicker';
import { proposedFolder, shortFolder } from '../project-folder';

export function NewProject({ onCreate, onClose, parent = '~/dev' }: {
  // Closing on success is the caller's, because only the caller knows whether
  // the store took it. A refusal leaves this card up, holding what was typed.
  onCreate: (p: { name: string; repoPath: string | null }) => void | Promise<unknown>;
  onClose: () => void;
  // WHERE THE PROPOSAL GOES. Learned from the folders her projects are already
  // in, so a fourth project lands beside the other three.
  parent?: string;
}) {
  const [name, setName] = useState('');
  // A folder pointed at by hand, which outranks the proposal.
  const [chosen, setChosen] = useState<string | null>(null);
  // Backspace on the words clears them, and typing a new name un-clears.
  const [cleared, setCleared] = useState(false);
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState(false);
  // WHY A PICK WAS TURNED DOWN. The home folder and the seven folders macOS
  // guards are not projects, and main refuses them rather than handing the
  // path back. The sentence goes where the card's own sentence is, because
  // that is where the eye already is.
  const [refused, setRefused] = useState<string | null>(null);
  // Up when there is no Mac chooser to open. Nothing else on the card changes.
  const [browsing, setBrowsing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => ref.current?.focus(), []);

  const folder = cleared ? null : (chosen ?? proposedFolder(name, parent));

  // Whether the sentence may say "a new folder". A folder chosen by hand is one
  // the chooser just listed, so it is there by definition and never asked about.
  useEffect(() => {
    if (!folder) { setExists(false); return; }
    if (chosen) { setExists(true); return; }
    let live = true;
    const t = setTimeout(() => {
      api.folderExists(folder).then((e) => { if (live) setExists(e); });
    }, 160);
    return () => { live = false; clearTimeout(t); };
  }, [folder, chosen]);

  const clause = useMemo(() => {
    if (!folder) return <>Its code is in <span className="np-word">a folder you choose</span>.</>;
    return (
      <>
        Its code is in <span className="np-word">{shortFolder(folder)}</span>
        {exists ? '.' : ', a new folder.'}
      </>
    );
  }, [folder, exists]);

  const took = (picked: string) => {
    setRefused(null);
    setChosen(picked);
    setCleared(false);
    setBrowsing(false);
  };

  const pick = async () => {
    const { path: picked, refused: why, browse } = await api.chooseFolder(chosen ?? undefined);
    // No Mac chooser behind this. Draw ours. Not a refusal and not a cancel.
    if (browse) { setBrowsing(true); return; }
    if (why) { setRefused(why); return; }
    // Cancelling changes nothing. It is not an answer.
    if (!picked) return;
    took(picked);
  };

  const make = () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    Promise.resolve(onCreate({ name: name.trim(), repoPath: folder }))
      .finally(() => setBusy(false));
  };

  if (browsing) {
    return (
      <FolderPicker
        startIn={chosen ?? folder}
        onPick={took}
        onClose={() => setBrowsing(false)}
      />
    );
  }

  return (
    <div className="modal-backdrop compose-backdrop" onClick={onClose}>
      <div className="modal compose np-card" onClick={(e) => e.stopPropagation()}>
        <input
          ref={ref}
          className="np-name"
          value={name}
          onChange={(e) => { setName(e.target.value); setCleared(false); setRefused(null); }}
          placeholder="What is the project called?"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') make();
            if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); make(); }
          }}
        />
        <div className="np-sentence">
          {/* ONE control on the card, and it is the words themselves. Same
              dotted underline as the new-task card's own clickable words, which
              is where a hand has already learned that a dotted word opens
              something. */}
          <button
            type="button"
            className="np-clauses"
            onClick={pick}
            title="Choose the folder"
            onKeyDown={(e) => {
              // Nothing yet: clear the words, and the project is made without a
              // folder, exactly as it was before this card existed.
              if (e.key === 'Backspace' || e.key === 'Delete') {
                e.preventDefault();
                setChosen(null);
                setCleared(true);
              }
            }}
          >{clause}</button>
          <button className="dock-send" disabled={!name.trim() || busy} onClick={make}>
            Make it <kbd>⌘↵</kbd>
          </button>
        </div>
        {refused && <p className="np-refused">{refused}</p>}
      </div>
    </div>
  );
}
