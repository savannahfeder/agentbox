// What a tester reads of the iPhone simulator's screen, from AXe's
// `describe-ui` tree: the words on it and numbered things to tap, in the
// same shape phone.mjs gives for the browser preview. Plain node, no
// packages: it runs on GitHub's Mac as well as the tester's computer.

export const SCREEN = { width: 393, height: 852 };

const TAPPABLE = new Set(['button', 'link', 'textfield', 'securetextfield', 'textview', 'textarea', 'searchfield', 'switch', 'toggle', 'cell', 'tab', 'tabbarbutton', 'checkbox', 'radiobutton', 'slider', 'segmentedcontrol', 'menuitem', 'popupbutton', 'incrementor', 'adjustable']);
const TYPEABLE = new Set(['textfield', 'securetextfield', 'textview', 'textarea', 'searchfield']);
const CONTAINERS = new Set(['application', 'window', 'group', 'scrollview', 'other', 'table', 'collectionview', 'navigationbar', 'tabbar', 'toolbar', 'keyboard']);
// "Other" is not here: it is how a React Native pressable with no role reaches iOS.
const NEVER_TAPPED = new Set(['application', 'window', 'group', 'scrollview', 'table', 'collectionview', 'navigationbar', 'tabbar', 'toolbar', 'keyboard', 'statictext', 'image', 'heading', 'header', 'progressindicator', 'alert']);

const kind = (el) => String(el.type ?? el.role ?? el.AXRole ?? '').replace(/^AX/, '').replace(/\s+/g, '').toLowerCase();
const words = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** `{x, y, width, height}` from AXe's `frame`, or its `AXFrame` string `{{x, y}, {w, h}}`. */
export function frameOf(el) {
  const f = el.frame;
  if (f && typeof f === 'object' && [f.x, f.y, f.width, f.height].every(Number.isFinite)) return { x: f.x, y: f.y, width: f.width, height: f.height };
  const m = String(el.AXFrame ?? '').match(/-?[\d.]+/g);
  if (m && m.length >= 4) { const [x, y, width, height] = m.map(Number); return { x, y, width, height }; }
  return null;
}

/** Every element in the tree, parents before children. AXe prints an array of roots, each with `children`. */
export function flatten(tree) {
  const out = [];
  const walk = (el) => { if (!el || typeof el !== 'object') return; out.push(el); for (const c of el.children ?? []) walk(c); };
  for (const root of Array.isArray(tree) ? tree : [tree]) walk(root);
  return out;
}

/** The tree from `describe-ui`'s output, which can carry lines before its JSON. */
export function parseTree(printed) {
  const s = String(printed);
  const at = s.search(/[[{]/);
  if (at < 0) throw new Error(`describe-ui printed no screen: ${s.slice(0, 200)}`);
  return JSON.parse(s.slice(at));
}

/** The screen's size in points: the application's frame, else an iPhone 16's. */
export function screenSize(tree) {
  for (const el of flatten(tree)) {
    const f = frameOf(el);
    if (f && f.width > 200 && f.height > 300 && ['application', 'window'].includes(kind(el))) return { width: f.width, height: f.height };
  }
  return SCREEN;
}

/** `{ text, things }`: the screen's words top to bottom, and what a thumb can press, numbered from 1. */
export function readScreen(tree) {
  const size = screenSize(tree);
  const onScreen = (f) => f && f.width > 1 && f.height > 1 && f.y + f.height > 0 && f.y < size.height && f.x + f.width > 0 && f.x < size.width;
  const els = flatten(tree).map((el) => ({ el, k: kind(el), f: frameOf(el), label: words(el.AXLabel ?? el.label ?? el.title), value: words(el.AXValue ?? el.value), hint: words(el.placeholder ?? el.AXPlaceholderValue ?? el.help) }))
    .filter((e) => onScreen(e.f));
  const byReading = (a, b) => (Math.round(a.f.y) - Math.round(b.f.y)) || (a.f.x - b.f.x);
  const lines = [];
  for (const e of [...els].sort(byReading)) {
    if (CONTAINERS.has(e.k) && !e.label) continue;
    const line = [e.label, e.value && e.value !== e.label ? e.value : ''].filter(Boolean).join(': ');
    if (line && lines.at(-1) !== line) lines.push(line);
  }
  // A big box with words and no role is a whole area, not a button.
  const area = size.width * size.height;
  const tappable = (e) => e.el.enabled !== false && (TAPPABLE.has(e.k) || (!NEVER_TAPPED.has(e.k) && e.label && e.f.width * e.f.height < area * 0.4));
  const things = els.filter(tappable).sort(byReading).slice(0, 80).map((e, i) => ({
    n: i + 1,
    words: (e.label || e.hint || e.value || e.k).slice(0, 60),
    typeable: TYPEABLE.has(e.k),
    value: e.value,
    x: e.f.x + e.f.width / 2,
    y: e.f.y + e.f.height / 2,
  }));
  return { size, text: lines.join('\n').slice(0, 4000), things };
}

/** What the tester reads after every command. */
export function lookText({ text, things }) {
  const list = things.map((t) => `${t.n}. "${t.words}"${t.typeable ? ` (a box to type in${t.value && t.value !== t.words ? `, holding "${t.value.slice(0, 40)}"` : ''})` : ''}`);
  return `SCREEN:\n${text}\n\nTHINGS TO TAP (${things.length}):\n${list.join('\n')}`;
}

/** Thing `n` from the last look, or the first whose words start with `arg`. */
export function pickThing(things, arg) {
  const n = Number(arg);
  if (Number.isInteger(n) && n > 0) return things.find((t) => t.n === n) ?? null;
  const want = words(arg).toLowerCase();
  if (!want) return null;
  return things.find((t) => t.words.toLowerCase().startsWith(want)) ?? things.find((t) => t.words.toLowerCase().includes(want)) ?? null;
}

/** Where a swipe starts and ends, in points: "up" moves the finger up, so the page scrolls on. */
export function swipePoints(size, dir) {
  const cx = Math.round(size.width / 2); const cy = Math.round(size.height / 2);
  const v = Math.round(size.height * 0.3); const h = Math.round(size.width * 0.35);
  const d = { up: [0, -v], down: [0, v], left: [-h, 0], right: [h, 0] }[dir];
  if (!d) return null;
  return { from: [cx - d[0] / 2, cy - d[1] / 2], to: [cx + d[0] / 2, cy + d[1] / 2] };
}

/** HID usage codes for the keys a tester names. */
export const KEYS = { enter: 40, return: 40, escape: 41, backspace: 42, delete: 42, tab: 43, space: 44 };
export function keyCode(name) {
  return KEYS[String(name ?? '').toLowerCase()] ?? null;
}
