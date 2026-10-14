import { useState } from 'react';
import { api } from '../api';
import FolderPicker from './FolderPicker';
import { projectFromFolder } from '../project-folder';

export function NewProject({ onCreate, onClose, onRefused }: {
  // Closing on success is the caller's, because only the caller knows whether
  // the store took it.
  onCreate: (p: { name: string; repoPath?: string; codexFolder?: boolean }) => void | Promise<unknown>;
  onClose: () => void;
  // WHY A PICK WAS TURNED DOWN. The home folder and the seven folders macOS
  // guards are not projects, and main refuses them rather than handing the path
  // back. With no card to write it on, the sentence goes to the caller, which
  // has the toast.
  onRefused?: (say: string) => void;
}) {
  const [browsing, setBrowsing] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const take = (picked: string) => {
    const made = projectFromFolder(picked);
    if (!made) { onClose(); return; }
    setBrowsing(false);
    onCreate(made);
  };

  const choose = async () => {
    const { path: picked, refused: why, browse } = await api.chooseFolder();
    if (browse) setBrowsing(true);
    else if (why) { onRefused?.(why); onClose(); return; }
    else if (picked) take(picked);
  };
  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setError('');
    try { await onCreate({name: name.trim(), codexFolder: true}); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create project.'); }
    finally { setBusy(false); }
  };
  if (browsing) {
    return <FolderPicker startIn={null} onPick={take} onClose={onClose} />;
  }
  return <div className="modal-backdrop compose-backdrop" onClick={onClose}>
    <form className="modal compose quick-project" onClick={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault(); void create();}}>
      <h2>Neues Projekt</h2>
      <label>Projektname<input autoFocus aria-label="Projektname" value={name} maxLength={100} onChange={e=>setName(e.target.value)} /></label>
      <p className="text-dim">Neuer Ordner: ~/Documents/Codex/Datum/Projektname</p>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={!name.trim() || busy}>{busy ? 'Wird erstellt …' : 'Projekt erstellen'}</button>
      <button type="button" onClick={()=>void choose()}>Vorhandenen Ordner wählen …</button>
      <button type="button" onClick={onClose}>Abbrechen</button>
    </form>
  </div>;
}
