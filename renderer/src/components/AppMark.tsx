// THE AGENTBOX MARK: the app's own logo, wherever the app names itself.
//
// Nine dots with the top right one lit (picked 2026-10-25). Here it is the dots
// alone; the dark tile around them belongs to the Mac app icon
// (renderer/src/assets/agentbox-icon.svg), and drawn in the app it shrank the
// logo to half its box and sank it into a dark sidebar. The unlit dots take the
// text colour so they read in every theme. This is only ever Agentbox; projects
// wear their colour (ProductMark.tsx).

const LIT = '#ee6018';
const AT = [21, 50, 79];

export function AppMark({ size = 24, title }: { size?: number; title?: string }) {
  return (
    <svg
      className="product-mark app-mark"
      viewBox="10 10 80 80"
      width={size} height={size}
      // Inline, because a panel's rule for its own icons would otherwise size it.
      style={{ width: size, height: size }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {AT.map((cy) => AT.map((cx) => (cx === 79 && cy === 21
        ? <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="10.5" fill={LIT} />
        : <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="10.5" fill="currentColor" fillOpacity="0.38" />)))}
    </svg>
  );
}
