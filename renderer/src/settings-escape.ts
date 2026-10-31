// WHO GETS ESCAPE ON THE SETTINGS SCREEN (QA batch 005, F-124).
//
// Settings listens on the window's capture phase and every menu inside it on
// the document's bubble, so Settings always ran first and a press meant to
// shut a dropdown left the screen as well. Capture cannot be given up — it is
// what keeps a stray Escape in a field from closing Settings the wrong way
// round — so the one listener asks what is open before it claims the press.

/** A screen over Settings, then an open menu inside it, then Settings itself. */
export function whatTakesEscape(doc: Pick<Document, 'querySelector'>): 'over' | 'menu' | 'settings' {
  if (doc.querySelector('.ps-over')) return 'over';
  if (doc.querySelector('.set-picker.open')) return 'menu';
  return 'settings';
}
