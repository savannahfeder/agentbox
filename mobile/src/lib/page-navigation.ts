/**
 * What a page an agent made may load in the app's frame: only itself. A link
 * opens in Safari, so the app is never a browser (App Review 2.3.6, the
 * unrestricted web access question).
 */
export function pageNavigation({ url, isTopFrame }: { url: string; isTopFrame?: boolean }): 'load' | 'open' | 'block' {
  if (url.startsWith('about:') || url.startsWith('data:')) return 'load';
  return isTopFrame === false ? 'block' : 'open';
}
