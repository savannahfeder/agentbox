// 2026-09-19: Codex references show a compact activity summary between prose,
// not a tally of raw tool names. Details remain expandable, failures visible.
import { it, expect } from 'vitest';
import { activitySummary } from '../renderer/src/activity-summary';
it('summarizes several tools without exposing a ledger of counts',()=>{expect(activitySummary([{verb:'read'},{verb:'ran'},{verb:'read'}])).toBe('Read files, ran commands');});
it('keeps one specific action readable',()=>{expect(activitySummary([{verb:'ran',subject:'npm test'}])).toBe('Ran npm test');});
it('handles empty and unknown tools without inventing work',()=>{expect(activitySummary([])).toBe('');expect(activitySummary([{verb:'looked up a tool'},{verb:'looked up a tool'}])).toBe('Looked up a tool');});
