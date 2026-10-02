// THE AGENTBOX MARK: the app's own logo, wherever the app names itself.
//
// It is the "On the grid" icon made for the launch film and picked as the full
// icon, tile and all, over the bare mark (2026-09-26). The same file is the
// README's icon and the source of the app icon (scripts/make-icon.mjs).
//
// It used to be a drawn sunburst that lived inside ProductMark as the default
// for any project without a picture, which put the app's logo beside every
// unnamed project. Projects now wear their colour (ProductMark.tsx); this is
// only ever Agentbox.

import icon from '../assets/agentbox-icon.svg?url';

export function AppMark({ size = 24, title }: { size?: number; title?: string }) {
  return (
    <img
      className="product-mark app-mark"
      src={icon}
      width={size} height={size}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      draggable={false}
    />
  );
}
