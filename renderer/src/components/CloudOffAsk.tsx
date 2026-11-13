// TURN THE CLOUD OFF? Asked when ⌘C or ⌘K would turn it off, in a box where
// ⌘K opens (approved designs/w-dd3b8c10c7/3-asks-before-turning-off-v3).
import { useEffect, useRef } from 'react';
import { CLOUD_OFF_ASK } from '../cloud-menu';

export function CloudOffAsk({ onOff, onKeep }: { onOff: () => void; onKeep: () => void }) {
  const said = useRef({ onOff, onKeep });
  said.current = { onOff, onKeep };
  // Caught first, so the window's own Enter and Escape do nothing else meanwhile.
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Enter') said.current.onOff(); else said.current.onKeep();
    };
    window.addEventListener('keydown', keys, true);
    return () => window.removeEventListener('keydown', keys, true);
  }, []);
  return (
    <div className="modal-backdrop palette-backdrop" onClick={onKeep}>
      <div className="modal palette cloud-off-ask" role="alertdialog" aria-label={CLOUD_OFF_ASK.head} onClick={(e) => e.stopPropagation()}>
        <div className="cloud-off-ask-head">{CLOUD_OFF_ASK.head}</div>
        <div className="cloud-off-ask-line">{CLOUD_OFF_ASK.line}</div>
        <div className="cloud-off-ask-acts">
          <button type="button" className="ts-done" onClick={onKeep}>{CLOUD_OFF_ASK.keep}<kbd>esc</kbd></button>
          <button type="button" className="ts-done cloud-off-ask-go" onClick={onOff}>{CLOUD_OFF_ASK.off}<kbd>↵</kbd></button>
        </div>
      </div>
    </div>
  );
}
