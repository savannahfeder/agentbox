import { StringDecoder } from 'node:string_decoder';

export interface LineFeed {
  (chunk: string | Buffer): void;
  /** Characters of an unfinished line held back. */
  held(): number;
}

/**
 * Hands each complete line of a stream to `onLine`, without its newline. Only
 * the newest chunk is searched, and a long line's pieces are joined once when
 * its newline arrives: growing one string and searching it from the start
 * copied a 4 MB line again for every 64 KB chunk.
 */
export function streamLines(onLine: (line: string) => void): LineFeed {
  const decoder = new StringDecoder('utf8');
  let parts: string[] = [];
  let held = 0;
  const feed = (chunk: string | Buffer) => {
    const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
    let start = 0;
    let at;
    while ((at = text.indexOf('\n', start)) >= 0) {
      const piece = text.slice(start, at);
      const line = parts.length ? parts.join('') + piece : piece;
      parts = [];
      held = 0;
      start = at + 1;
      onLine(line);
    }
    if (start < text.length) {
      const rest = start ? text.slice(start) : text;
      parts.push(rest);
      held += rest.length;
    }
  };
  return Object.assign(feed, { held: () => held });
}
