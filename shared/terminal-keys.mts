// OPTION+LEFT AND OPTION+RIGHT JUMP A WORD, as they do in Mac Terminal.
// xterm 6 sends them as ESC[1;3D and ESC[1;3C, which zsh and bash do not bind,
// so a shell typed `;3D` into the line instead. Mac Terminal sends ESC b and
// ESC f, the backward-word and forward-word every shell already knows.
//
// Returns what to send for this key, '' to swallow the keyup of one we
// handled, or undefined to leave the key to xterm. Off a Mac nothing changes:
// Linux terminals send the same ESC[1;3D xterm does.
const WORD = { ArrowLeft: '\x1bb', ArrowRight: '\x1bf' };

export function optionWordKey(event, isMac) {
  if (!isMac || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return undefined;
  const sequence = WORD[event.key];
  if (!sequence) return undefined;
  return event.type === 'keydown' ? sequence : '';
}
