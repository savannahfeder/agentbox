// A new thread, a whole page as the phone layout draws it (phone.css `.tc-card`):
// a cross and the page's name, Send and its Send later caret at the right, and
// the form (ui/NewThreadForm.tsx) under them.
import { Redirect } from 'expo-router';
import { router } from '../lib/router';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { screenGate } from '../lib/thread-gate';
import { useCloud } from '../state/cloud';
import { Cross } from '../ui/icons';
import { NewThreadFields, NewThreadFoot, NewThreadSheets, SendButtons, useNewThread } from '../ui/NewThreadForm';
import { footRoom, IconButton, T, TopBar, Wall } from '../ui/parts';
import { font } from '../ui/theme';

export default function NewThread() {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const form = useNewThread(close);
  const gate = screenGate(c);
  if (gate === 'wait') return <Wall><View /></Wall>;
  if (gate === 'sign-in') return <Redirect href="/sign-in" />;

  return (
    <Wall>
      <TopBar
        left={<IconButton label="Close" onPress={close}><Cross /></IconButton>}
        title={<T style={{ fontFamily: font.medium, fontSize: 19, letterSpacing: -0.19, paddingLeft: 4 }}>New thread</T>}
        right={<View style={{ marginRight: 12 }}><SendButtons form={form} /></View>}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <NewThreadFields form={form} />
        </ScrollView>
        <NewThreadFoot form={form} foot={footRoom(inset)} />
      </KeyboardAvoidingView>
      <NewThreadSheets form={form} now={c.now} />
    </Wall>
  );
}
