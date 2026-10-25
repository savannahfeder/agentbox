// The room screens' icons, as drawn in round 23.
// `d` is only ever one of the constant path strings below, never anything a
// person or an agent wrote, so the raw markup cannot carry their words.
const svg = (d: string, size: number, sw: number, cls?: string) => (
  // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
  <svg className={cls} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />
);

const HASH = '<path d="M9.5 4.5 7.5 19.5M16.5 4.5l-2 15M5 9.5h14.5M4.5 14.5H19"/>';
const PIN = '<path d="M9 4h6l-1 5 3 3H7l3-3z"/><path d="M12 15v5"/>';
const INVITE = '<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 20c.7-3.4 3.3-5.3 6.5-5.3 1.4 0 2.6.3 3.7.9"/><path d="M18 14v6M15 17h6"/>';
const EYE_OFF = '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.4.8-1.3 2-2.5 3.2M6.6 7.6C4.6 8.9 3.2 10.8 2.5 12c1 1.8 4.5 6 9.5 6 1.5 0 2.9-.4 4.1-1"/><path d="M9.9 10a3 3 0 0 0 4.1 4.1"/>';

export const I = {
  room: () => svg(HASH, 20, 1.25, 'workspace-nav-icon'),
  hash: (size = 13) => svg(HASH, size, 1.4),
  chev: () => svg('<path d="m10 7 5 5-5 5"/>', 12, 1.6),
  down: () => svg('<path d="m7 10 5 5 5-5"/>', 12, 1.6),
  dots: () => svg('<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="2.4"/>', 15, 1.5),
  plusRow: () => svg('<path d="M12 5.5v13M5.5 12h13"/>', 20, 1.25, 'workspace-nav-icon'),
  plus: () => svg('<path d="M12 5.5v13M5.5 12h13"/>', 15, 1.5),
  pin: () => svg(PIN, 15, 1.4),
  pinFill: () => svg('<path d="M9 4h6l-1 5 3 3H7l3-3z" fill="currentColor"/><path d="M12 15v5"/>', 15, 1.4),
  // Cut to the pin itself, so its edge lines up with the text beside it.
  pinMark: () => (
    <svg width="8" height="12" viewBox="6.2 3.2 11.6 17.6" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4h6l-1 5 3 3H7l3-3z" fill="currentColor" /><path d="M12 15v5" />
    </svg>
  ),
  invite: (size = 15) => svg(INVITE, size, 1.4),
  people: () => svg('<circle cx="9" cy="9" r="3.2"/><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.8c1.8.6 3 2.1 3.4 4.7"/>', 15, 1.4),
  trophy: () => svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3"/><path d="M12 13v4M8.5 20h7"/>', 15, 1.4),
  bell: () => svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5h4"/>', 15, 1.4),
  out: () => svg('<path d="M14 5h5v14h-5"/><path d="M10 8l-4 4 4 4M6 12h9"/>', 15, 1.4),
  back: () => svg('<path d="M15 6l-6 6 6 6"/>', 16, 1.6),
  expand: () => svg('<path d="M14 5h5v5M10 19H5v-5M19 5l-6 6M5 19l6-6"/>', 15, 1.5),
  search: () => svg('<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>', 15, 1.5),
  eyeOff: (size = 15) => svg(EYE_OFF, size, 1.5),
  eye: () => svg('<path d="M2.5 12c1-1.8 4.5-6 9.5-6s8.5 4.2 9.5 6c-1 1.8-4.5 6-9.5 6s-8.5-4.2-9.5-6z"/><circle cx="12" cy="12" r="3"/>', 15, 1.5),
  ghost: () => svg('<path d="M6 20V11a6 6 0 0 1 12 0v9l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z"/><path d="M10 11h.01M14 11h.01" stroke-width="2"/>', 16, 1.4),
  link: () => svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', 15, 1.5),
  x: () => svg('<path d="M6 6l12 12M18 6 6 18"/>', 15, 1.5),
  check: () => svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 12, 2),
  lock: () => svg('<rect x="5" y="11" width="14" height="9"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 15, 1.4),
  chat: () => svg('<path d="M5 5h14v10H9l-4 4z"/>', 15, 1.4),
  groupNav: () => svg('<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5"/><path d="M15 5.8a3 3 0 0 1 0 5.4M16.8 14.2c2 .6 3.3 2.2 3.7 4.8"/>', 20, 1.25, 'workspace-nav-icon'),
  chatNav: () => svg('<path d="M15 9V4H4v8h2v3l3-3"/><path d="M9 9h11v8h-2v3l-3-3H9z"/>', 20, 1.25, 'workspace-nav-icon'),
  flame: () => svg('<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.5 1 2.5 2 3 0-3.5 0-6 1-8.5z"/>', 18, 1.4),
  smile: () => svg('<circle cx="12" cy="12" r="8"/><path d="M8.8 14c.8 1.1 1.9 1.7 3.2 1.7s2.4-.6 3.2-1.7"/><path d="M9.5 10h.01M14.5 10h.01" stroke-width="2"/>', 14, 1.4),
};
