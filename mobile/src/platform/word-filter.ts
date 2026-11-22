// The word list behind the chats' filter, kept out of lib/ so the tests, which
// run without the phone app's packages, never load it.
import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from 'obscenity';
import { cleanWords, type Found } from '../lib/chat-safety';

let matcher: RegExpMatcher | null = null;
const find = (text: string): Found[] => {
  matcher ??= new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
  return matcher.getAllMatches(text).map((m) => ({ start: m.startIndex, end: m.endIndex + 1 }));
};

export const filtered = (text: string) => cleanWords(text, find);
