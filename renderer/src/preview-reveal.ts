import {useCallback, useEffect, useRef, useState} from 'react';

// Load completes before the compositor necessarily has the frame's pixels.
export function waitForPreviewPaint(reveal: () => void) {
  let cancelled = false;
  let frame = requestAnimationFrame(() => {
    if (cancelled) return;
    frame = requestAnimationFrame(() => { if (!cancelled) reveal(); });
  });
  return () => { cancelled = true; cancelAnimationFrame(frame); };
}

export function usePreviewReveal(source: string | null) {
  const [readySource, setReadySource] = useState<string | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => {
    setReadySource(null);
    return () => { cancel.current?.(); };
  }, [source]);
  const reveal = useCallback(() => {
    cancel.current?.();
    cancel.current = waitForPreviewPaint(() => setReadySource(source));
  }, [source]);
  return [source !== null && readySource === source, reveal] as const;
}
