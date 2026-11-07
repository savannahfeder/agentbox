// An opened file's wait, which always ends: in the file, or in a sentence.
import { useEffect, useState } from 'react';
import { OPEN_WITHIN_MS, didNotOpen, opensLike } from '../opening-wait';
import { PreviewLoading } from './PreviewLoading';

export function OpeningWait({ name, kind, onAgain }: { name: string; kind: string | null; onAgain?: () => void }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLate(true), OPEN_WITHIN_MS);
    return () => clearTimeout(timer);
  }, []);
  if (late) {
    return <div className="doc-missing" role="alert">
      <span>{didNotOpen(name)}</span>
      {onAgain && <> <button type="button" className="av-btn" onClick={onAgain}>Try again</button></>}
    </div>;
  }
  return opensLike(kind) === 'words' ? <PreviewLoading /> : <div className="doc-missing" role="status">Opening {name}…</div>;
}
