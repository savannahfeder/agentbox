// The mark beside a project's name.
//
// A project's own picture when it has one. Otherwise ITS COLOUR: the same
// square, from the same slug, that the composer's project menu draws
// (threads/composer-rules.ts `projectSwatch`), so a project looks like itself
// on every screen.
//
// It used to draw a sunburst here, which was also the Agentbox logo, so every
// project without a picture wore the app's mark. That is gone for good; the
// Agentbox mark is AppMark.tsx and only ever means Agentbox.

import { projectSwatch } from '../threads/composer-rules';

export function ProductMark({ src, name, slug, size = 24 }: {
  // A product's own mark. Anything truthy wins over the colour.
  src?: string | null;
  name: string;
  /** What the colour is read from. The slug, so it matches the composer; the name only as a fallback. */
  slug?: string;
  size?: number;
}) {
  if (src) {
    return <img className="product-mark" src={src} alt="" width={size} height={size} aria-hidden="true" />;
  }
  // The square sits inside a box the size the picture would have been, so a
  // row lines up the same with or without one.
  const side = Math.max(8, Math.round(size * 0.46));
  return (
    <span className="product-mark product-swatch" style={{ width: size, height: size }} aria-hidden="true" title={name}>
      <i style={{ width: side, height: side, background: projectSwatch(slug ?? name) }} />
    </span>
  );
}
