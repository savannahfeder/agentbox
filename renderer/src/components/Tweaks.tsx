// The tweaks dock: the open taste calls, floating in the bottom-right corner.
//
// It is NOT a modal, and that is the whole design. A modal covers the thing
// you are judging and takes the keyboard with it, so comparing meant open,
// look, close, look, open again. This sits over the corner of the app with no
// backdrop; the inbox behind it stays lit and stays interactive, and hovering
// an option repaints it live.
//
// She hit × once and lost it.
//
// So CLOSED is now for this session only, and ⌘K brings it back. GONE stays
// mine to do when she says the taste calls are settled, and it is this file
// plus one line in App. A control that can hide itself permanently needs a way
// back that does not involve me.

import { useEffect, useState } from 'react';
import { TWEAKS, type TweakValues } from '../tweaks';

export function Tweaks({ values, onPreview, onPick, onHide }: {
  values: TweakValues;
  onPreview: (tweakId: string, optionId: string) => void;
  onPick: (tweakId: string, optionId: string) => void;
  onHide: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ tweak: string; option: string } | null>(null);

  // Escape closes the drawer, never the app's own selection: the dock is a
  // guest on this screen and must not eat a key the inbox uses.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [open]);

  const hover = (tweakId: string, optionId: string) => {
    setPreview({ tweak: tweakId, option: optionId });
    onPreview(tweakId, optionId);
  };
  // Moving off without picking puts her own choice back, so a stray pointer
  // never leaves the app wearing something she did not choose.
  const unhover = (tweakId: string) => {
    setPreview(null);
    onPreview(tweakId, values[tweakId]);
  };

  return (
    <div className={`tweaks-dock${open ? ' open' : ''}`}>
      {open && (
        <div className="tweaks-panel">
          {TWEAKS.map((t) => (
            <div className="tweak" key={t.id}>
              <div className="tweak-label">{t.label}</div>
              <div className="tweak-note">{t.note}</div>
              <div className="tweak-options">
                {t.options.map((o) => {
                  const on = values[t.id] === o.id;
                  const trying = preview?.tweak === t.id && preview.option === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      className={`tweak-option${on ? ' on' : ''}${trying && !on ? ' trying' : ''}`}
                      onMouseEnter={() => hover(t.id, o.id)}
                      onMouseLeave={() => unhover(t.id)}
                      onClick={() => onPick(t.id, o.id)}
                    >
                      <span className="tweak-option-label">{o.label}</span>
                      <span className="tweak-option-hint">{o.hint}</span>
                      {on && <span className="tweak-option-on">on</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="tweaks-foot">Hover to try one, click to keep it. Your pick sticks across restarts.</div>
        </div>
      )}
      <div className="tweaks-bar">
        <button type="button" className="tweaks-toggle" onClick={() => setOpen((o) => !o)}>
          <span className="tweaks-dot" aria-hidden="true" />
          Tweaks
        </button>
        <button
          type="button"
          className="tweaks-close"
          title="Hide until reload (⌘K brings it back)"
          aria-label="Hide tweaks"
          onClick={onHide}
        >
          ×
        </button>
      </div>
    </div>
  );
}
