// THE INBOX ZERO PAGE: A ZERO AND ONE FIELD.
//
// So the whole page is three things and no more: the figure, one line under it,
// and the field.
//
// THE FIELD IS THE ONE SHE ALREADY APPROVED and it is unchanged: same class,
// same words, same key. It is the only thing on this page you can press, and
// pressing it opens the real composer, which is where typing has always
// happened. A second place to type would be a second draft to lose.
//
// The eight arrangements drawn in August and the five drawn for this page are
// all dead; their copy is in decisions.md. Do not re-offer an arrangement of
// them.

export function IdlePage({ working, onCompose, onAgents }: {
  working: number;
  onCompose: () => void;
  // What is still running, said in the line under the figure and pressable
  // through to In progress. Absent when nothing is running, because "0 agents
  // are working" is a sentence about nothing.
  onAgents: () => void;
}) {
  return (
    <div className="zero-state idle">
      <div className="idle-zero-col">
        {/* THE FIGURE. Its own element rather than a character inside the line
            below it, because the stylesheet crops its box to its ink and that
            cannot be done to a glyph sitting in a sentence. */}
        <b className="idle-zero">0</b>
        <span className="idle-zero-say">
          Inbox zero
          {working > 0 && (
            <>
              {' · '}
              <button className="idle-zero-agents" onClick={onAgents}>
                {working === 1 ? 'one agent working' : `${working} agents working`}
              </button>
            </>
          )}
        </span>
        <button className="idle-field" onClick={onCompose}>
          <span className="idle-ph">What do you need done?</span>
          <span className="idle-key">N</span>
        </button>
      </div>
    </div>
  );
}
