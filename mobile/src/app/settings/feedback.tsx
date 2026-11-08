// Send feedback, opened from General (ui/FeedbackPage.tsx), or a report about
// one thread, opened from its menu.
import { useLocalSearchParams } from 'expo-router';
import { FeedbackPage } from '../../ui/FeedbackPage';
import { Page } from '../../ui/SettingsParts';

export default function Feedback() {
  const { report, title } = useLocalSearchParams<{ report?: string; title?: string }>();
  const about = report ? { ref: report, title: title ?? '' } : null;
  return <Page title={report ? 'Report this thread' : 'Send feedback'} back={report ? 'Thread' : 'General'}><FeedbackPage about={about} /></Page>;
}
