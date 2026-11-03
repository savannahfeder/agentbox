// A repeat made from a thread is named what the thread is called, so its runs
// are told the whole message here (standingInstruction reads the body).
export function repeatBody(item: { title?: string; body?: string }): string {
  const title = (item.title ?? '').trim();
  const body = (item.body ?? '').trim();
  return body ? `${title}\n\n${body}` : title;
}
