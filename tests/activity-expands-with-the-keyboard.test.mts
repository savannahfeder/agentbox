// 2026-09-19: measured in the full app preview: pressing Enter on the focused
// activity disclosure left aria-expanded=false because App's task shortcut
// prevented the native button click. Only activation keys stay in the control.
import { it, expect, vi } from 'vitest';
import { keepActivityKeyLocal } from '../renderer/src/activity-summary';
it.each(['Enter',' '])('keeps %s away from task shortcuts without preventing native activation',key=>{const event={key,stopPropagation:vi.fn(),preventDefault:vi.fn()};keepActivityKeyLocal(event);expect(event.stopPropagation).toHaveBeenCalledOnce();expect(event.preventDefault).not.toHaveBeenCalled();});
it.each(['Tab','Escape','r'])('leaves %s available for normal navigation',key=>{const event={key,stopPropagation:vi.fn()};keepActivityKeyLocal(event);expect(event.stopPropagation).not.toHaveBeenCalled();});
