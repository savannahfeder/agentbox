// The options parser is the seam between agent-written markdown and the 1/2/3
// keys. Tolerant by design: prose without options renders as prose.

import { describe, it, expect } from 'vitest';
import { parseOptions, previewText } from '../renderer/src/format';

describe('parseOptions', () => {
  it('parses a schema-shaped body', () => {
    const body = [
      '## Context', 'Some context.',
      '## Options',
      '1. Monthly default (recommended)',
      '2. Annual default',
      '3. Ship monthly-only',
      '## What happens next', '1. This numbered line is not an option.',
    ].join('\n');
    const options = parseOptions(body);
    expect(options).toHaveLength(3);
    expect(options[0].recommended).toBe(true);
    expect(options[1]).toMatchObject({ n: 2, recommended: false });
  });

  it('returns nothing for prose', () => {
    expect(parseOptions('Just an update, nothing to decide.')).toHaveLength(0);
    expect(parseOptions(undefined)).toHaveLength(0);
  });
});

describe('previewText', () => {
  it('strips markdown to one line', () => {
    const preview = previewText('## Where we were\nYou asked for **bold** [link](http://x) ![img](a.png)\n\nMore.');
    expect(preview).toContain('You asked for bold link');
    expect(preview).not.toContain('#');
    expect(preview).not.toContain('![');
  });
});
