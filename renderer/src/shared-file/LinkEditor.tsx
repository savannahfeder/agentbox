// A shared document an editor types into on its page, in the app's own editor.
// It hands back the markdown a moment after the typing stops; the page saves it.
import { useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { buildExtensions } from '../editor/extensions';
import { mdToPmDoc, pmDocToMd } from '../editor/markdown';
import { patchOriginal } from '../editor/patch-md';

const SAVE_AFTER_MS = 900;

/**
 * `text`: the words under the title as the link holds them. A newer copy from
 * somebody else is taken in only while nothing typed here waits to be saved.
 */
export function LinkEditor({ text, onWords, label }: { text: string; onWords: (md: string) => void; label: string }) {
  const given = useRef(text);
  // The same words after a trip through the editor, so a save writes back only the lines that were touched.
  const base = useRef(pmDocToMd(mdToPmDoc(text)));
  const waiting = useRef<number | null>(null);
  const handOn = useRef(onWords);
  handOn.current = onWords;
  const extensions = useMemo(() => buildExtensions('Write anything…', { drawnFrom: (src) => src }), []);

  const editor = useEditor({
    extensions,
    content: mdToPmDoc(text),
    editorProps: { attributes: { 'aria-label': label } },
    onUpdate: () => {
      if (waiting.current != null) window.clearTimeout(waiting.current);
      waiting.current = window.setTimeout(flush, SAVE_AFTER_MS);
    },
  });

  function flush() {
    waiting.current = null;
    if (!editor || editor.isDestroyed) return;
    const md = pmDocToMd(editor.getJSON());
    if (md === base.current) return;
    const out = patchOriginal(given.current, base.current, md) ?? md;
    given.current = out;
    base.current = md;
    handOn.current(out);
  }

  useEffect(() => {
    if (!editor || editor.isDestroyed || text === given.current || waiting.current != null) return;
    given.current = text;
    base.current = pmDocToMd(mdToPmDoc(text));
    const { from, to } = editor.state.selection;
    editor.commands.setContent(mdToPmDoc(text), { emitUpdate: false });
    const end = editor.state.doc.content.size;
    editor.commands.setTextSelection({ from: Math.min(from, end), to: Math.min(to, end) });
  }, [editor, text]);

  // Leaving the page with words not yet handed on hands them on.
  useEffect(() => {
    const away = () => { if (waiting.current != null) { window.clearTimeout(waiting.current); flush(); } };
    window.addEventListener('pagehide', away);
    return () => { window.removeEventListener('pagehide', away); away(); };
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  return <EditorContent editor={editor} className="doc-rich-content doc-prose sf-editing" />;
}
