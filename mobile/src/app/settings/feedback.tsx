// Send feedback, opened from General (ui/FeedbackPage.tsx), or a report about
// one thread or one chat message, opened from its menu.
import { useLocalSearchParams } from 'expo-router';
import { FeedbackPage } from '../../ui/FeedbackPage';
import { Page } from '../../ui/SettingsParts';

export default function Feedback() {
  const { report, title, answer, kind } = useLocalSearchParams<{ report?: string; title?: string; answer?: string; kind?: string }>();
  const message = kind === 'message';
  const about = report ? { ref: report, title: title ?? '', answer: answer ?? '', kind: message ? 'message' as const : 'thread' as const } : null;
  return <Page title={!report ? 'Send feedback' : message ? 'Report this message' : 'Report this thread'} back={!report ? 'General' : message ? 'Chat' : 'Thread'}><FeedbackPage about={about} /></Page>;
}
