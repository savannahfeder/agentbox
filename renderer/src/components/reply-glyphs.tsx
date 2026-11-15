// The reply box's paperclip and the arrow Send turns into when the box is narrow.

export const ClipGlyph = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.7-7.7" />
  </svg>
);

// Drawn only when the reply box is too narrow for the word (narrow-conversation.css).
export const SendGlyph = () => (
  <svg className="dock-send-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);
