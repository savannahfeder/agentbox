import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Move one mounted document between layouts without discarding editor state. */
export function ArtifactSurface({ target, children }: {target: HTMLElement | null; children: ReactNode}) {
  const [host] = useState(() => {
    const node = document.createElement('div');
    node.className = 'artifact-host';
    return node;
  });
  useLayoutEffect(() => {
    if (!target) return;
    target.appendChild(host);
    return () => { host.remove(); };
  }, [target, host]);
  return createPortal(children, host);
}
