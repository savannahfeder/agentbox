// The way through a deck or a PDF: back, where you are, forward, in one small
// pill that floats over the pages rather than a bar above them.
const Chevron = ({ back }: { back?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={back ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'} />
  </svg>
);

export function FilePager({ at, count, word, onGo }: { at: number; count: number | null; word: string; onGo: (n: number) => void }) {
  const lower = word.toLowerCase();
  return <div className="file-pager" role="group" aria-label={`${word}s`}>
    <button type="button" className="file-pager-step" aria-label={`Previous ${lower}`} disabled={!count || at <= 1} onClick={() => onGo(at - 1)}><Chevron back /></button>
    <span className="file-pager-count" aria-live="polite">{count ? <>{word} {at}<i> of {count}</i></> : 'Opening…'}</span>
    <button type="button" className="file-pager-step" aria-label={`Next ${lower}`} disabled={!count || at >= count} onClick={() => onGo(at + 1)}><Chevron /></button>
  </div>;
}
