// THE ONE ROW OF CHROME AN URGENT ROW ADDS WHEN IT TAKES HER SCREEN.
//
// SHE PICKED THIS AND THE OTHER TWO ARE GONE.C was "it takes the screen": the
// urgent row replaces what she was reading, and the sentence that used to
// explain itself is replaced by this. The card over her task and the pop-up in
// the corner were the two she did not pick; both are deleted, and their copy is
// in decisions.md under 2026-08-25 so nothing was lost. Do not bring either of
// them back as a setting: anything still switchable is something she has to
// decide again.
//
// WHY IT IS A CONTROL AND NOT A SENTENCE.The built line said "Urgent, so it
// came to the front. Escape goes back to …", which explains a metaphor and
// names a key, every single time. This says the one thing she cannot work out
// by looking — which task she was on — and she can press it.
//
// AND WHY THE WORD STAYS.The indication is the half she kept, and on this
// treatment it is the only thing on screen saying why the pane changed under
// her.

/**
 * Enough of a title to recognise it by, and no more.
 *
 * Her titles run to eighty characters and this is a button on one row, so
 * quoting one whole turns a whisper into a paragraph, which is the cognitive
 * overload her design law rules out. Cut on a word so it never breaks
 * mid-word, and never cut at all when it already fits. Moved here from
 * Focus.tsx, where it fed the sentence she asked us to take out; the only
 * change is that a button label gets no full stop on the end.
 */
const TITLE_BUDGET = 44;

function shortTitle(title: string): string {
  const clean = title.trim();
  if (clean.length <= TITLE_BUDGET) return clean.replace(/[,;:.\s]+$/, '');
  const cut = clean.slice(0, TITLE_BUDGET);
  const space = cut.lastIndexOf(' ');
  // A title whose first 44 characters hold no useful word break is cut at 44
  // rather than thrown away down to nothing.
  return `${(space > TITLE_BUDGET / 2 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, '')}\u2026`;
}

export function BackToWhatSheWasReading({ title, onBack }: { title: string; onBack: () => void }) {
  // The way back on the left, the amber word on the right, both on the reading
  // column's own left edge: the pane gains ONE row, not two.
  return (
    <div className="urgent-bar">
      <button className="urgent-return" onClick={onBack}>
        <span className="urgent-return-arrow">←</span> Back to {shortTitle(title)}
      </button>
      <span className="urgent-word">Urgent</span>
    </div>
  );
}
