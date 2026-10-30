// The logo with its orange dot running round the ring, for a screen that is
// waiting on something. The order and the timing are renderer/src/logo-orbit.ts;
// each dot is grey with an orange layer whose opacity the keyframes move.
import { ORBIT_CORNER, orbitDelay } from '../logo-orbit';

export function LogoOrbit() {
  return (
    <span className="logo-orbit" aria-hidden="true">
      {Array.from({ length: 9 }, (_, cell) => {
        const delay = orbitDelay(cell);
        return <span key={cell} className="logo-orbit-dot" data-corner={cell === ORBIT_CORNER || undefined}
          data-still={delay === null || undefined}
          style={delay === null ? undefined : { ['--orbit-delay' as string]: `${delay}ms` }} />;
      })}
    </span>
  );
}
