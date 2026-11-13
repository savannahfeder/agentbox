// Text with the words that were typed set in ink, the way a result row draws them.
import { splitHits } from '../search';

export function Hits({ text, terms, phrase }: { text: string; terms?: string[]; phrase?: string }) {
  if (!terms?.length) return <>{text}</>;
  return (
    <>
      {splitHits(text, terms, phrase).map((run, i) => (
        run.hit ? <b className="hit" key={i}>{run.text}</b> : <span key={i}>{run.text}</span>
      ))}
    </>
  );
}
