import {useEffect, useRef, useState, type RefObject} from 'react';
import {api} from '../api';
import {completionQuery, completionMatches, insertCompletion, type CatalogEntry} from '../../../shared/composer-catalog.mjs';

// New chats use the same provider catalog as replies, before they have an id.
export function IntegrationPicker({product, engine, text, setText, input}: {
  product: string; engine: string; text: string; setText: (text: string) => void; input: RefObject<HTMLTextAreaElement>;
}) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [caret, setCaret] = useState(text.length);
  const [at, setAt] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [status, setStatus] = useState('Loading Codex integrations…');
  const box = useRef<HTMLDivElement>(null);
  const query = engine === 'codex' ? completionQuery(text, caret) : null;
  const discovering = !!query;
  const rows = query ? completionMatches(catalog, query.trigger, query.query) : [];
  useEffect(() => {
    setCatalog([]);
    if (engine !== 'codex' || !product) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const reload = async () => {
      try { const rows = await api.composerCatalog({product, id: '', engine}); if (!stopped) {setCatalog(rows); setStatus('No matching integrations');} }
      catch {if (!stopped) setStatus('Could not load Codex integrations');}
      finally {if (!stopped && discovering) timer = setTimeout(reload, 15000);}
    };
    void reload();
    return () => {stopped = true; clearTimeout(timer);};
  }, [product, engine, discovering]);
  useEffect(() => {setAt(0); setDismissed(null);}, [text]);
  const pick = (row: CatalogEntry) => {
    if (!query) return;
    const end = query.start + row.insert.length + 1;
    setText(insertCompletion(text, query, row.insert)); setCaret(end);
    requestAnimationFrame(() => {input.current?.focus(); input.current?.setSelectionRange(end, end);});
  };
  useEffect(() => {
    const element = input.current; if (!element) return;
    const track = () => setCaret(element.selectionStart);
    const keys = (e: KeyboardEvent) => {
      if (!query || dismissed === text) return;
      if (e.key === 'Escape') {e.preventDefault(); e.stopPropagation(); setDismissed(text); return;}
      if (!rows.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {e.preventDefault(); e.stopPropagation(); setAt(n => (n + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length);}
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {e.preventDefault(); e.stopPropagation(); pick(rows[Math.min(at, rows.length - 1)]);}
    };
    element.addEventListener('input', track); element.addEventListener('select', track); element.addEventListener('keydown', keys, true);
    return () => {element.removeEventListener('input', track); element.removeEventListener('select', track); element.removeEventListener('keydown', keys, true);};
  }, [text, query?.query, query?.trigger, at, rows, dismissed]);
  useEffect(() => {box.current?.querySelector('.cursor')?.scrollIntoView({block: 'nearest'});}, [at]);
  if (!query || dismissed === text) return null;
  return <div className="slash-menu tc-integration-menu" ref={box} role="listbox" aria-label="Codex integrations">
    {!rows.length && <div className="completion-status" role="status">{status}</div>}
    {rows.map((row, i) => <button key={row.insert} type="button" role="option" aria-selected={i === at} className={`slash-row${i === at ? ' cursor' : ''}`} onMouseEnter={() => setAt(i)} onMouseDown={e => {e.preventDefault(); pick(row);}}>
      <span className="slash-cmd">{row.icon && /^(https:\/\/|data:image\/)/.test(row.icon) && <img className="completion-logo" src={row.icon} alt="" onError={e => {e.currentTarget.hidden = true;}} />}{row.name}</span>
      <span className="slash-hint">{row.kind} · {row.description}</span>
    </button>)}
  </div>;
}
