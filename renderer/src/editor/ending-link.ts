// A link that ends where its address ends. TipTap's Link with autolink is an
// inclusive mark, so words typed straight after a pasted link went into it.
import { Link } from '@tiptap/extension-link';

export const EndingLink = Link.extend({ inclusive: () => false });
