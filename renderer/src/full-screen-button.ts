type Wide = { requestFullscreen?: () => Promise<void> | void } | null | undefined;
type FullScreenDoc = { fullscreenElement: unknown; exitFullscreen: () => Promise<void> | void };

/** The film bar's Full screen button: in when nothing is full screen, out when anything is. */
export function pressFullScreen(target: Wide, doc: FullScreenDoc): void {
  const asked = doc.fullscreenElement ? doc.exitFullscreen() : target?.requestFullscreen?.();
  void Promise.resolve(asked).catch(() => {});
}
