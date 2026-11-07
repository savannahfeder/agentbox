// Send feedback, opened from General (ui/FeedbackPage.tsx).
import { FeedbackPage } from '../../ui/FeedbackPage';
import { Page } from '../../ui/SettingsParts';

export default function Feedback() {
  return <Page title="Send feedback" back="General"><FeedbackPage /></Page>;
}
