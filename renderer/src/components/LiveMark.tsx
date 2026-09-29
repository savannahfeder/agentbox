// The working mark at the conversation foot; the header is plain text.
// Adapted to the app's existing session state from React Bits' Lattice Loader:
// https://reactbits.dev/c/micro/lattice-loader?step=155
// Its 3x3 orbit uses a 155ms step, scaled by 1.2. Negative delays show motion
// immediately. No extra clock: Live and Byline already own real elapsed time.
// Queued/paused/idle marks and reduced-motion marks remain completely still.
const ORBIT = [0, 1, 2, 7, null, 3, 6, 5, 4];

export function LiveMark({ still = false }: { still?: boolean }) {
  return (
    <span className={`live-mark ${still ? 'is-still' : ''}`} aria-hidden="true">
      {ORBIT.map((phase, index) => (
        <span key={index} className="live-lattice-cell" data-hole={phase === null || undefined}
          style={phase === null ? undefined : { animationDelay: `${phase * 186 - 1488}ms` }} />
      ))}
    </span>
  );
}
