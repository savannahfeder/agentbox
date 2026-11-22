// A new thread, a whole page: a cross and the page's name, then the form
// (ui/NewThreadForm.tsx), which opens on the message and sends from its foot.
import { Redirect } from 'expo-router';
import { router } from '../lib/router';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { screenGate } from '../lib/thread-gate';
import { useCloud } from '../state/cloud';
import { Cross } from '../ui/icons';
import { NewThreadFields, NewThreadFoot, NewThreadSheets, SendButtons, useNewThread } from '../ui/NewThreadForm';
import { footRoom, IconButton, TopBar, Wall } from '../ui/parts';

export default function NewThread() {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const form = useNewThread(close, () => router.push('/new'));
  const gate = screenGate(c);
  if (gate === 'wait') return <Wall><View /></Wall>;
  if (gate === 'sign-in') return <Redirect href="/sign-in" />;

  return (
    <Wall>
      <TopBar left={<IconButton label="Close" onPress={close}><Cross /></IconButton>} title="New thread" />
      {/* A permission card floats over the foot; the chips and Send stay above it. */}
      <KeyboardAvoidingView style={{ flex: 1, paddingBottom: c.approvalRoom ? Math.max(0, c.approvalRoom + 6 - footRoom(inset)) : 0 }} behavior="padding">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <NewThreadFields form={form} />
        </ScrollView>
        <NewThreadFoot form={form} foot={footRoom(inset)} send={<SendButtons form={form} />} />
      </KeyboardAvoidingView>
      <NewThreadSheets form={form} now={c.now} />
    </Wall>
  );
}
