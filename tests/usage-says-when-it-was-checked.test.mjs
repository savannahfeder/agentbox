// The 2026-10-07 screenshot had three meters, zero refresh controls, and no
// checked time. A cached 100% reading looked current even after switching.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ClaudeUsageSection, usageCheckedAt } from '../renderer/src/components/Settings';
const now = 1_000_000;
const reading = { engine: 'claude', profile: '/profiles/one', at: now - 60_000, limits: [{ span: 'week', qualifier: 'all models', name: 'This week', percent: 100 }] };
const draw = (props = {}) => renderToStaticMarkup(React.createElement(ClaudeUsageSection, { reading, profile: '/profiles/one', email: 'one@example.test', now, ...props }));
it('offers refresh and names the account and age of the reading', () => {
  const html = draw();
  expect(html).toContain('Refresh');
  expect(html).toContain('one@example.test');
  expect(html).toContain('Checked 1 minute ago');
  expect(html).toContain('100% used');
});
it('never draws a different account’s cached percentage', () => {
  const html = draw({ profile: '/profiles/two', email: 'two@example.test' });
  expect(html).not.toContain('100% used');
  expect(html).toContain('No usage reading yet');
  expect(html).not.toContain('Checked 1 minute ago');
});
it('keeps refresh available before the first reading', () => {
  const html = draw({ reading: null });
  expect(html).toContain('Refresh');
  expect(html).not.toContain('disabled');
});
it('keeps freshness honest at the minute and hour boundaries', () => {
  expect(usageCheckedAt(now, now)).toBe('Checked just now');
  expect(usageCheckedAt(now - 59_999, now)).toBe('Checked just now');
  expect(usageCheckedAt(now - 60_000, now)).toBe('Checked 1 minute ago');
  expect(usageCheckedAt(now - 120_000, now)).toBe('Checked 2 minutes ago');
  expect(usageCheckedAt(now - 3_600_000, now)).toBe('Checked 1 hour ago');
  expect(usageCheckedAt(null, now)).toBe('');
});
