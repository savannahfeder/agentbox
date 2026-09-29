export function previewFocus<T extends { id: string }>(search: string, items: T[], inbox: T[]): T | undefined {
  const query = new URLSearchParams(search);
  const focus = query.get('focus');
  if (focus === '1') return inbox[0];
  if (query.get('fixtures') === '1') return items.find(item => item.id === focus);
  return undefined;
}
