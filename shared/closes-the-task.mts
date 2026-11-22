// THE OPTION THAT CLOSES THE TASK (w-1df18b337a). Once a run has shipped, the
// one honest next move is often to close the row, and agents are told to offer
// exactly "Close this task". A pick is a reply, and a reply on a finished row
// starts a run, so this is caught and done the way E does it instead. The words
// alone or with a reason after them: "Ship it, then close the task" and "Close
// this task, then file the follow-up" are still replies.
// Shared so the ship can tell too (./ship-closes-its-thread.mts).
const CLOSES = /^close (?:this|the) (?:task|thread)(?:$|\s*[,:;\p{Pd}](?!\s*(?:then|and|also)\b)|\s+(?:since|because|as|now that)\b)/iu;
// "Keep it as sent and close this task" asks for no work either. Keeping something
// in particular ("Keep the first layout and close this task") does.
const KEEPS_AND_CLOSES = /^(?:keep|leave) (?:it|this|them|that)(?: as (?:is|sent|it is))?\s*,?\s+and close (?:this|the) (?:task|thread)$/i;
// "Looks right, close this task" is a close too.
const RIGHT_FIRST = /^(?:(?:that|it|this|all)\s+)?(?:looks\s+|is\s+)?(?:right|good|fine|great|perfect|correct)\s*[,.;:!]?\s+(?:and\s+|so\s+)?(?=close\b)/i;
export function closesTheTask(option: string): boolean {
  const words = bareOption(option).replace(RIGHT_FIRST, '');
  return CLOSES.test(words) || KEEPS_AND_CLOSES.test(words);
}

export const bareOption = (option: string) => option.replace(/\s*\(recommended\)\s*/i, '').trim().replace(/[.!]+$/, '');
