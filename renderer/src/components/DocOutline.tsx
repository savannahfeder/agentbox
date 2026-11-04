// The headings of a long document, beside it, with the one being read lit.
// Read off the page as drawn, so it follows her edits as she types.
import { useEffect, useState } from 'react';
import { outlineOf, outlineShows, sectionAt, type OutlineEntry } from '../doc-outline';

/** How far below the top of the scroller a heading counts as being read. */
const READING_LINE = 120;

const headingsIn = (page: HTMLElement) => [...page.querySelectorAll<HTMLElement>('h1, h2, h3, h4')];

export function DocOutline({ scroller, page }: { scroller: HTMLElement | null; page: HTMLElement | null }) {
  const [entries, setEntries] = useState<OutlineEntry[]>([]);
  const [on, setOn] = useState(-1);

  useEffect(() => {
    if (!page) return undefined;
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = outlineOf(headingsIn(page).map((el) => ({ level: Number(el.tagName[1]), text: el.textContent ?? '' })));
        setEntries((was) => (JSON.stringify(was) === JSON.stringify(next) ? was : next));
      });
    };
    read();
    const seen = new MutationObserver(read);
    seen.observe(page, { childList: true, subtree: true, characterData: true });
    return () => { seen.disconnect(); cancelAnimationFrame(frame); };
  }, [page]);

  useEffect(() => {
    if (!scroller || !page || !outlineShows(entries)) return undefined;
    const spy = () => {
      const els = headingsIn(page);
      const top = scroller.getBoundingClientRect().top;
      const atFoot = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
      setOn(atFoot && scroller.scrollTop > 0 ? entries.length - 1
        : sectionAt(entries.map((e) => (els[e.at]?.getBoundingClientRect().top ?? Infinity) - top), READING_LINE));
    };
    spy();
    scroller.addEventListener('scroll', spy, { passive: true });
    return () => scroller.removeEventListener('scroll', spy);
  }, [scroller, page, entries]);

  if (!outlineShows(entries)) return null;
  const go = (entry: OutlineEntry) => {
    const el = page && headingsIn(page)[entry.at];
    if (!el || !scroller) return;
    scroller.scrollTo({ top: scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 32, behavior: 'smooth' });
  };
  return <nav className="doc-outline" aria-label="Contents">
    <div className="doc-outline-box">
      <span className="doc-outline-head">Contents</span>
      <ol>
        {entries.map((e, i) => (
          <li key={`${e.at}-${e.text}`} className={`${e.depth ? 'is-sub' : ''}${i === on ? ' is-on' : ''}`}>
            <button type="button" title={e.text} aria-current={i === on ? 'location' : undefined} onClick={() => go(e)}>
              <i aria-hidden="true" /><span>{e.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  </nav>;
}
