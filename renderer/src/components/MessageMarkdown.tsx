// A message drawn from markdown, parsed again only when its words, plugins or
// components change. The open thread is redrawn on every refresh while an
// agent works, and react-markdown parses its words on every render
// (tests/a-refresh-does-not-parse-a-conversation-again).
import { memo } from 'react';
import ReactMarkdown from 'react-markdown';

export const MessageMarkdown = memo(ReactMarkdown);
