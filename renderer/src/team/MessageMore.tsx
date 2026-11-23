// WHAT ELSE YOU CAN DO TO ONE MESSAGE, behind the bar's more button: edit and
// delete your own, copy its words, and mark the conversation unread from it.
// The editor takes the message's place, Return saves and Escape puts it back;
// deleting asks once, because it is taken back for everyone.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { RichReply, type RichBox } from './RichReply';
import { chatDoc, chatMarkdown } from './chat-editor';
import './chat.css';

export type MoreItem =
  | { label: string; onClick: () => void; danger?: boolean; hint?: string; icon?: ReactNode }
  | 'rule';

const MENU_W = 220;
const EDGE = 8;

// Under a button the menu hangs from its right edge; at the pointer, from the
// pointer, the way a right click menu opens.
function placeMenu(at: DOMRect, height: number, width = MENU_W): CSSProperties {
  const from = at.width === 0 ? at.left : at.right - width;
  const left = Math.max(EDGE, Math.min(from, window.innerWidth - width - EDGE));
  const below = at.bottom + 4;
  const top = below + height <= window.innerHeight - EDGE ? below : Math.max(EDGE, at.top - 4 - height);
  return { left: Math.round(left), top: Math.round(top), width };
}

export function MoreMenu({ at, items, onClose, width = MENU_W }: { at: DOMRect; items: MoreItem[]; onClose: () => void; width?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties>({ left: -9999, top: -9999, width });
  const [pick, setPick] = useState(0);
  const rows = items.filter((i): i is Exclude<MoreItem, 'rule'> => i !== 'rule');
  useLayoutEffect(() => { setPlace(placeMenu(at, box.current?.offsetHeight ?? 200, width)); }, [at, width]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); setPick((n) => (n + 1) % rows.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); setPick((n) => (n + rows.length - 1) % rows.length); return; }
      if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); const row = rows[pick]; onClose(); row?.onClick(); }
    };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', key, true); };
  }, [onClose, rows, pick]);
  let n = -1;
  return createPortal(
    <div className="chat-menu" ref={box} style={place} role="menu">
      {items.map((item, i) => {
        if (item === 'rule') return <div key={`r${i}`} className="chat-menu-rule" />;
        n += 1;
        const me = n;
        return (
          <button key={item.label} type="button" role="menuitem" className={`chat-menu-row${item.danger ? ' danger' : ''}${me === pick ? ' on' : ''}`}
            onMouseEnter={() => setPick(me)} onClick={() => { onClose(); item.onClick(); }}>
            {item.icon && <span className="chat-menu-ico">{item.icon}</span>}<span>{item.label}</span>{item.hint && <kbd>{item.hint}</kbd>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** Asked once before a message is taken back for everyone. */
export function DeleteMessage({ onDelete, onClose }: { onDelete: () => void; onClose: () => void }) {
  return <AskBeforeDeleting title="Delete this message?" body="It is taken back for everyone in the conversation." label="Delete message" onDelete={onDelete} onClose={onClose} />;
}

export function AskBeforeDeleting({ title, body, label, onDelete, onClose }: { title: string; body: string; label: string; onDelete: () => void; onClose: () => void }) {
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    yes.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return createPortal(
    <div className="chat-confirm-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="chat-confirm" role="alertdialog" aria-label={label}>
        <div className="chat-confirm-title">{title}</div>
        <div className="chat-confirm-body">{body}</div>
        <div className="chat-confirm-foot">
          <button type="button" className="chat-confirm-no" onClick={onClose}>Cancel</button>
          <button type="button" className="chat-confirm-yes" ref={yes} onClick={() => { onClose(); onDelete(); }}>Delete</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * THE MESSAGE'S WORDS, EDITABLE WHERE THEY ARE. Return saves, Shift+Return is
 * a new line, Escape leaves it as it was. Saving no words at all asks to
 * delete, as in every chat app.
 */
export function MessageEditor({ text, onSave, onCancel, onEmpty }: {
  text: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  onEmpty: () => void;
}) {
  // In the chat box's own editor, so a quote or a list is edited as one, not as its marks;
  // compared in that editor's markdown, so opening and saving untouched changes nothing.
  const start = useMemo(() => chatMarkdown(chatDoc(text)), [text]);
  const [value, setValue] = useState(start);
  const box = useRef<RichBox | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const save = () => {
    const next = value.trim();
    if (!next) { onEmpty(); return; }
    if (next === start.trim()) { onCancel(); return; }
    onSave(next);
  };
  return (
    <div className="chat-edit">
      <RichReply className="chat-edit-box" boxRef={box} value={value} onChange={setValue} placeholder="" label="Edit message"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); return true; }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); return true; }
          return false;
        }} />
      <div className="chat-edit-foot">
        <span className="chat-edit-hint">Return to save, Esc to cancel</span>
        <button type="button" className="chat-edit-cancel" onClick={onCancel}>Cancel</button>
        <button type="button" className="chat-edit-save" onClick={save}>Save</button>
      </div>
    </div>
  );
}
