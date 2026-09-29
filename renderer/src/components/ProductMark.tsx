// The mark beside a product's name in the rail.
//
// So this is the DEFAULT, drawn rather than shipped as an asset, and it is a
// default in the real sense: the moment a product carries a mark of its own,
// that is what renders instead.
//
// Sized to the name beside it rather than to itself: the name came down to
// 16/500 and a 30px burst next to it read as the mark being the subject.
//
// Drawn, not an image file, for two reasons. It inherits the ink, so it is
// correct in both themes without a second file and without anyone remembering
// there is a second file. And the burst's rhythm is the product's stage: the
// rays are evenly spaced and identical, which is a sun rather than a logo with
// an opinion, and a company that has not chosen a mark yet should not appear to
// have chosen this one.

const RAYS = 24;

export function ProductMark({ src, name, size = 24 }: {
  // A product's own mark, once products can carry one. Anything truthy wins
  // over the default; nothing here interprets it beyond drawing it.
  src?: string | null;
  name: string;
  size?: number;
}) {
  if (src) {
    return <img className="product-mark" src={src} alt="" width={size} height={size} aria-hidden="true" />;
  }
  // Rays are drawn from a hair inside the rim to the rim, so the burst reads as
  // light leaving a disc rather than as a wheel with spokes.
  const rays = Array.from({ length: RAYS }, (_, i) => {
    const a = (i / RAYS) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    // Alternating length, which is what stops it reading as a gear.
    const inner = i % 2 === 0 ? 5.6 : 6.4;
    const outer = i % 2 === 0 ? 11 : 9.6;
    return (
      <line
        key={i}
        x1={12 + cos * inner} y1={12 + sin * inner}
        x2={12 + cos * outer} y2={12 + sin * outer}
      />
    );
  });

  // Stroke weight is set against the name beside it, not on its own. At 1.1 the
  // rays were a hairline next to a 16/500 name and the pair read as unfinished.
  return (
    <svg
      className="product-mark"
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
      aria-hidden="true"
    >
      <title>{name}</title>
      {rays}
    </svg>
  );
}
