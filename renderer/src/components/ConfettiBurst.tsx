// One burst of confetti that falls once and is gone (styles.css, `.fr-burst`).
import { useRef } from 'react';

export function ConfettiBurst() {
  // Computed once so a re-render does not restart the burst.
  const pieces = useRef(Array.from({ length: 40 }, (_, i) => ({
    left: 4 + ((i * 97) % 92),
    delay: ((i * 53) % 40) / 100,
    drift: ((i * 31) % 120) - 60,
    spin: ((i * 71) % 540) - 270,
    hue: [199, 267, 42, 158, 12][i % 5],
    fall: 62 + ((i * 17) % 26),
  })));
  return (
    <div className="fr-burst" aria-hidden="true">
      {pieces.current.map((p, i) => (
        <span key={i} className="fr-bit" style={{
          left: `${p.left}%`,
          animationDelay: `${p.delay}s`,
          ['--fr-drift' as string]: `${p.drift}px`,
          ['--fr-spin' as string]: `${p.spin}deg`,
          ['--fr-fall' as string]: `${p.fall}vh`,
          background: `hsl(${p.hue} 78% 62%)`,
        }} />
      ))}
    </div>
  );
}
