// Feedback from a phone, the web app's and the phone app's alike: the same
// server function the Mac's card posts to (main/feedback.mts), on the cloud
// the phone was built for.
import { feedbackPayload, sendFeedback } from '../../shared/feedback.mjs';

type Cloud = { url: string };
export type FeedbackFiles = { name: string; type: string; data: string }[];

export const feedbackAddressOn = (cfg: Cloud) => new URL('/functions/v1/feedback', cfg.url).href;

export function sendPhoneFeedback(cfg: Cloud, { text, files, os = 'phone website', version = '' }: { text: string; files: FeedbackFiles; os?: string; version?: string }, fetchImpl: (url: string, init: RequestInit) => Promise<{ ok: boolean }> = (u, i) => fetch(u, i)) {
  return sendFeedback({ url: feedbackAddressOn(cfg), payload: feedbackPayload({ text, files, app: { version, os } }), fetchImpl });
}
