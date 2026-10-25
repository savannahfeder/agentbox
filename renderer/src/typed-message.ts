// A PERSON'S MESSAGE, SPLIT INTO WHAT THEY TYPED AND WHAT THE APP ATTACHED.
//
// A person's words are drawn as typed, never through markdown (Thread.tsx,
// w-a33b339772). But the app itself writes every picture or file attached to a
// message into the text as markdown, one per line (attachments.ts:
// `![name](attachments/…)` or `[name](attachments/…)`). Drawn as typed, a pasted
// screenshot showed up as that line of brackets instead of the picture
// (2026-10-05, tests/a-picture-you-paste-into-a-message-is-drawn.test.mjs).
//
// So those lines, and only those, are lifted out to be drawn as markdown:
//   a picture, `![…](…)`, standing alone on its line;
//   a file link, `[…](attachments/…)`, standing alone on its line.
// The syntax quoted inside a sentence is words, and so is a link a person typed
// to anywhere else: the app never writes either.

export type TypedPart = { text: string } | { embed: string };

const PICTURE = /^!\[[^\]\n]*\]\([^)\s]+\)$/;
const ATTACHED_FILE = /^\[[^\]\n]*\]\((?:attachments\/[^)\s]+|phone-files\/[0-9a-f]{64}\.[a-z0-9]{1,8})\)$/;

const isEmbed = (line: string) => PICTURE.test(line.trim()) || ATTACHED_FILE.test(line.trim());

// A thread picked with # is the other thing the app writes into a person's
// words, `[Its name](w-…)` (thread-mentions.ts), and it is drawn as the thread.
const THREAD_LINK = /\[((?:\\.|[^\]\\\n])*)\]\((w-[a-f0-9]{10})\)/g;
const unescaped = (words: string) => words.replace(/\\([[\]\\])/g, '$1');

export type TypedPiece = { text: string } | { thread: string; text: string };

export function threadPieces(text: string): TypedPiece[] {
  const out: TypedPiece[] = [];
  let at = 0;
  for (const m of text.matchAll(THREAD_LINK)) {
    if (m.index! > at) out.push({ text: text.slice(at, m.index) });
    out.push({ thread: m[2], text: unescaped(m[1]) });
    at = m.index! + m[0].length;
  }
  if (!out.length) return [{ text }];
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** The words with each thread link down to the thread's name. */
export const threadWords = (text: string) => text.replace(THREAD_LINK, (_, words: string) => unescaped(words));

export function typedParts(text: string): TypedPart[] {
  const parts: TypedPart[] = [];
  let words: string[] = [];
  const flush = () => {
    // An embed draws on its own line, so the blank lines that set it apart
    // from the words are already said by the drawing. Inside the words every
    // break stays where it was typed.
    const said = words.join('\n').replace(/^\n+|\n+$/g, '');
    if (said.trim()) parts.push({ text: said });
    words = [];
  };
  for (const line of text.split('\n')) {
    if (isEmbed(line)) {
      flush();
      parts.push({ embed: line.trim() });
    } else {
      words.push(line);
    }
  }
  flush();
  // Nothing attached: the text exactly as it came, trailing breaks and all.
  if (!parts.some((p) => 'embed' in p)) return [{ text }];
  return parts;
}
