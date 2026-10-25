// What a chat deep inside the page asks of the app around it, without a prop
// threaded through every screen in between: mark a conversation unread, say a
// short note, and edit your newest message from the reply box.

export const MARK_UNREAD = 'agentbox:mark-unread';
export const SAY = 'agentbox:say';
export const EDIT_LAST = 'chat:edit-last';

export const askMarkUnread = (thread: { product: string; id: string }) =>
  window.dispatchEvent(new CustomEvent(MARK_UNREAD, { detail: thread }));

export const say = (text: string) => window.dispatchEvent(new CustomEvent(SAY, { detail: text }));

export const editLast = () => window.dispatchEvent(new Event(EDIT_LAST));
