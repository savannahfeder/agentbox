import type { CSSProperties } from 'react';
import { initialsOf } from './room-rules';

/** A square face: the photo, or two letters in mono when there is none. */
export function RoomFace({ name, url, size, outline }: { name: string; url?: string | null; size: number; outline?: boolean }) {
  const style: CSSProperties = { width: size, height: size };
  if (url) return <img className="rm-pic" src={url} style={style} alt="" referrerPolicy="no-referrer" />;
  const font = Math.max(5.5, Math.round(size * 0.28 * 2) / 2);
  return <span className={`rm-pic rm-ini${outline ? ' o' : ''}`} style={{ ...style, lineHeight: `${size - 2}px`, fontSize: font }} aria-hidden="true">{initialsOf(name)}</span>;
}
