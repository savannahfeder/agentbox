// The picker both schedules use: a typed box with a live preview, a refusal
// when the words were not understood, and a list of presets underneath.
//
// It was Snooze's, and it is here because a repeating task needs the same
// gesture and the same law, and two copies of a picker is how two screens end
// up disagreeing about what Enter meant. Snooze picks a MOMENT, repeat picks an
// HOUR that comes back; everything around that is identical, so everything
// around that lives here.
//
// WHAT THE USER TYPED DECIDES, OR NOTHING DOES. Falling through to the
// highlighted preset when the text failed to parse is what scheduled an item for
// thirty minutes when "tomorrow" was typed, while the preview beside the box was
// already saying it did not understand (2026-08-10). Refusing out loud is the
// only honest third answer, and `enterMeans` is the one copy of that rule.

import { useEffect, useRef, useState } from 'react';
import { enterMeans } from '../format';
import { Name } from '../../../shared/product-name.mjs';

export interface PickerOption<T> {
  label: string;
  value: T;
  hint?: string;
}

export function SchedulePicker<T>({
  title, subtitle, placeholder, hintWhenRefused, options, parse, previewOf, onChoose, onClose,
}: {
  title: string;
  subtitle?: string;
  placeholder: string;
  hintWhenRefused: string;
  options: Array<PickerOption<T>>;
  parse: (text: string) => { value: T; label: string } | null;
  previewOf: (value: T) => string;
  onChoose: (value: T, label: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [selected, setSelected] = useState(0);
  const [refused, setRefused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const parsed = parse(text);

  useEffect(() => ref.current?.focus(), []);

  const pick = () => {
    const means = enterMeans(text, parsed);
    if (means === 'typed' && parsed) onChoose(parsed.value, parsed.label);
    else if (means === 'selected') {
      const option = options[selected];
      if (option) onChoose(option.value, option.label.toLowerCase());
    } else setRefused(true);
  };

  return (
    // Stop the click here: this can open from inside another modal, and the
    // backdrop underneath would take a click meant for this one as a dismissal
    // of both.
    <div className="modal-backdrop" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="modal snooze" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        {subtitle && <div className="modal-subtitle">{subtitle}</div>}
        <div className="snooze-input-row">
          <input
            ref={ref}
            className="palette-input snooze-input"
            value={text}
            placeholder={placeholder}
            onChange={(e) => { setText(e.target.value); setRefused(false); }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter') pick();
              if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, options.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(0, s - 1)); }
            }}
          />
          {text && (
            <span className={`snooze-preview ${parsed ? '' : 'invalid'}`}>
              {parsed ? previewOf(parsed.value) : 'not a time'}
            </span>
          )}
        </div>
        {refused && (
          <div className="snooze-refused">
            {Name} did not understand "{text.trim()}", so nothing was set. {hintWhenRefused}
          </div>
        )}
        <div className="palette-list">
          {options.map((option, i) => (
            /* Hover follows the MOUSE MOVING, not the modal arriving. This
               opens under wherever the cursor already was, so onMouseEnter
               silently moved the selection onto a row she never pointed at and
               Enter took it. A stationary cursor fires no mousemove, so it
               cannot steal. */
            <div
              key={option.label}
              className={`palette-item ${!text && i === selected ? 'selected' : ''}`}
              onClick={() => onChoose(option.value, option.label.toLowerCase())}
              onMouseMove={() => setSelected(i)}
            >
              <span>{option.label}</span>
              <span className="palette-hint">{option.hint ?? ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
