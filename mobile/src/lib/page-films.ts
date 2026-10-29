// THE FILMS IN A PAGE, MADE TO PLAY ON THE PHONE. A page is drawn with none of
// its own code running (PageFrame.tsx), so a film that waited for the page's
// code to start it, or to draw its buttons, sat still. Each plain film gets its
// own controls and plays in place. A film's working page (HyperFrames: clips
// timed by `data-start`, moved by the page's code) is left as it is: no
// controls make a stack of clips into the film. Agents send the finished video
// instead (briefs/message-rules.md). tests/a-film-inside-a-page-plays-on-the-phone

const VIDEO = /<(video)(?=[\s>])([^>]*)>/gi;
const CLIP = /\bclass\s*=\s*["'][^"']*\bclip\b[^"']*["'][^>]*\bdata-start\s*=|\bdata-start\s*=[^>]*\bclass\s*=\s*["'][^"']*\bclip\b|\bdata-hf-id\s*=/i;
const has = (attrs: string, name: string) => new RegExp(`(?:^|\\s)${name}(?=[\\s=>/]|$)`, 'i').test(attrs);

/** Is this page a film's working page, its clips run by its own code? */
export const isFilmWorkingPage = (html: string) => [...String(html).matchAll(VIDEO)].some((m) => CLIP.test(m[2]));

/** Every plain film in the page with its controls, playing in place. */
export function filmsPlayHere(html: string): string {
  return String(html).replace(VIDEO, (whole, tag: string, attrs: string) => {
    if (CLIP.test(attrs)) return whole;
    const add = [has(attrs, 'controls') ? '' : ' controls', has(attrs, 'playsinline') ? '' : ' playsinline'].join('');
    return add ? `<${tag}${add}${attrs}>` : whole;
  });
}
