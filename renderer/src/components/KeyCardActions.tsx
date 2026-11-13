// The buttons of the card a cloud run raises to ask this computer for a key
// (main/cloud/key-asks.mts): Send the key, Deny, and Reply, which swaps them
// for a box whose words go back to the run instead of a yes or a no.
import { useState, type ReactNode, type KeyboardEvent } from 'react';
import { CardKey } from './CardKey';

export function KeyCardActions({ send, deny, chord, replying, onReplying, onReply }: {
  send: ReactNode;
  deny: ReactNode;
  chord: (keys: string) => string;
  replying: boolean;
  onReplying: (on: boolean) => void;
  onReply: (words: string) => void;
}) {
  const [words, setWords] = useState('');
  const go = () => { if (words.trim()) onReply(words.trim()); };
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); go(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onReplying(false); }
  };
  if (replying) {
    return <>
      <input className="approval-reply-box" autoFocus value={words} placeholder="Tell the agent instead" maxLength={2000}
        onChange={(e) => setWords(e.target.value)} onKeyDown={keys} />
      <div className="approval-actions">
        <button type="button" className="approval-allow" disabled={!words.trim()} onClick={go}>Send reply<span className="approval-key">↵</span></button>
        <button type="button" className="approval-deny" onClick={() => onReplying(false)}>Back<span className="approval-key">esc</span></button>
      </div>
    </>;
  }
  return <div className="approval-actions">
    {send}{deny}
    {/* Drawn apart from Deny, at the far end and without its box: the two were mixed up. */}
    <button type="button" className="approval-reply" onClick={() => onReplying(true)}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 4 2.5 7.5 6 11" /><path d="M2.5 7.5H9a4.5 4.5 0 0 1 4.5 4.5v.5" /></svg>
      Reply<CardKey keys={chord('⌘3')} />
    </button>
  </div>;
}
