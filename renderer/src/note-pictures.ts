// Pictures in a note on a file ride in its text as the links persistAttachments
// writes, so the agent gets them by the path a pasted reply picture takes.

export type NotePicture = { name: string; src: string };

// Only what the app saved itself: a note is a teammate's words, and any other
// path in one is theirs to have typed, not a picture to fetch.
const PICTURE = /!\[([^\]]*)\]\((attachments\/[^)\s]+\.(?:png|jpe?g|gif|webp))\)/gi;

/** Joined on one line, so the note stays a single bullet in what the agent is told. */
export function noteWithPictures(words: string, links: string): string {
  return [words.trim(), links.trim().replace(/\s*\n\s*/g, ' ')].filter(Boolean).join(' ');
}

export function notePictures(text: string): { words: string; pictures: NotePicture[] } {
  const pictures: NotePicture[] = [];
  const words = text.replace(PICTURE, (_m, name: string, src: string) => {
    pictures.push({ name, src });
    return '';
  });
  return pictures.length ? { words: words.replace(/[ \t]{2,}/g, ' ').trim(), pictures } : { words: text, pictures };
}
