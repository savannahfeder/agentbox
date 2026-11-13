// A key inside an approval card's button, such as ⌘1. Geist has no ⌘, and a
// fallback font's ⌘ stands taller than Geist's numbers, so it is drawn instead.
import { Fragment } from 'react';

const CommandMark = () => (
  <svg className="key-mark" viewBox="1.75 1.75 20.5 20.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
  </svg>
);

export function CardKey({ keys }: { keys: string }) {
  const parts = keys.split('⌘');
  return <span className="approval-key">{parts.map((p, i) => <Fragment key={i}>{i > 0 && <CommandMark />}{p}</Fragment>)}</span>;
}
