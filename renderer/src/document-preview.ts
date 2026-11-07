export function watchDocumentOverflow(content: HTMLElement, frame: HTMLElement, changed: (overflow: boolean) => void) {
  const measure = () => changed(content.scrollHeight > frame.clientHeight + 1);
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(content);
  observer.observe(frame);
  return () => observer.disconnect();
}
