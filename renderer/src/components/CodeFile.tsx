// A script as it reads in an editor: its colours and its line numbers. The same
// colours a change draws (code-artifact.ts), one line at a time.
import { forwardRef, memo, useMemo } from 'react';
import { tokenize } from '../code-artifact';
import './file-views.css';

const Line = memo(function Line({ text }: { text: string }) {
  const toks = useMemo(() => tokenize(text), [text]);
  return <>{toks.map((t, i) => (t.c ? <span key={i} className={`t-${t.c}`}>{t.s}</span> : t.s))}</>;
});

// Past this a line-by-line colouring costs more than it gives.
const MOST_COLOURED_LINES = 6000;

export const CodeFile = memo(forwardRef<HTMLDivElement, { text: string }>(function CodeFile({ text }, ref) {
  const lines = useMemo(() => text.replace(/\n$/, '').split('\n'), [text]);
  return <div className="code-file" ref={ref}>
    {lines.map((line, i) => <div className="code-file-line" key={i}>
      <span className="code-file-n" aria-hidden="true" data-n={i + 1} />
      <code className="code-file-text">{i < MOST_COLOURED_LINES ? <Line text={line} /> : line}{'\n'}</code>
    </div>)}
  </div>;
}));
