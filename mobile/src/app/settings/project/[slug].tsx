// One project's page, as the desktop's has it: its name, its place in the
// running order, how it runs, and archiving it.
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, TextInput } from 'react-native';
import { CODEX_MODES } from '../../../../../renderer/src/codex-modes';
import { MODE_SENTENCE, RULES_ALWAYS_APPLY } from '../../../../../renderer/src/modes';
import { moveProduct } from '../../../../../shared/rank.mts';
import { router } from '../../../lib/router';
import { useSettings } from '../../../state/settings';
import { useRunningOrder } from '../../../ui/SettingsPages';
import { Button, Choice, Group, Page, Row, Switch } from '../../../ui/SettingsParts';
import { color, corner, font } from '../../../ui/theme';

export default function ProjectSettings() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const s = useSettings();
  const ranked = useRunningOrder();
  const [draft, setDraft] = useState<string | null>(null);
  const w = s.settings?.workspace;
  const p = s.settings?.projects.find((x: { slug: string }) => x.slug === slug);
  if (!s.settings) return null;
  if (!p) return <Redirect href="/settings/projects" />;
  const set = (key: string, value: unknown) => void s.change({ scope: 'project', product: p.slug, key, value });
  const read = (key: string, copy: unknown) => s.reading('project', key, copy, p.slug);
  const auto = read('autonomous', p.autonomous);
  const account = read('account', p.account);
  const permission = read('permission', p.permission);
  const codex = read('codexMode', p.codexMode);
  const name = read('name', p.name);
  const typed = draft ?? (name.value as string);
  const order = s.reading('workspace', 'productOrder', w?.productOrder ?? []);
  const at = ranked.findIndex((x) => x.slug === p.slug);
  const placed = (order.value as string[]).includes(p.slug);
  const two = (w?.engines ?? []).length > 1;
  const accounts: { id: string; email: string | null }[] = w?.accounts ?? [];
  return (
    <Page title={name.value as string} back="Projects">
      <Group>
        <Row first stack label="Name" reading={name}
          control={<>
            <TextInput value={typed} onChangeText={setDraft} maxLength={120} autoCorrect={false} accessibilityLabel="Project name" returnKeyType="done"
              style={[{ flex: 1, height: 36, marginRight: 12, color: color.text, fontFamily: font.regular, fontSize: 15, paddingHorizontal: 10, borderWidth: 1, borderRadius: corner.small, borderColor: color.line, backgroundColor: color.field }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
            <Button title="Rename" disabled={!typed.trim() || typed.trim() === name.value} onPress={() => { set('name', typed.trim()); setDraft(null); }} />
          </>} />
      </Group>
      <Group label="Order">
        <Row first label={placed ? `Now #${at + 1} of ${ranked.length}` : 'Not ranked yet'} reading={order.waiting || order.refused ? order : undefined}
          control={<Button title="Rank first" disabled={placed && at === 0}
            onPress={() => void s.change({ scope: 'workspace', key: 'productOrder', value: moveProduct(ranked.map((x) => x.slug), p.slug, 0) })} />} />
      </Group>
      <Group label="How it runs">
        <Row first label="Let agents start the tasks they file here" reading={auto}
          desc="A task an agent writes on this project gets a session straight away. Without this it waits in your inbox for your yes. Questions and reviews always wait for you either way."
          control={<Switch label="Let agents start the tasks they file here" on={!!auto.value} onChange={(v) => set('autonomous', v)} />} />
        {accounts.length > 1 || account.value !== 'any' ? (
          <Row label="Claude account" stack reading={account}
            desc="Every Claude Code agent on this project runs on this account and on no other. If the account cannot run, the work waits."
            control={<Choice label="Claude account" value={account.value as string} options={[{ value: 'any', label: 'Any account' }, ...accounts.map((a) => ({ value: a.id, label: a.email ?? a.id }))]} onChange={(v) => set('account', v)} />} />
        ) : null}
        {permission.value !== 'workspace' ? (
          <Row stack label={two ? 'This project has its own Claude Code permissions' : 'This project has its own permissions'} reading={permission}
            desc={permission.value === 'custom' ? MODE_SENTENCE.custom : `${MODE_SENTENCE[permission.value as keyof typeof MODE_SENTENCE] ?? ''} ${RULES_ALWAYS_APPLY}`}
            control={<Button title="Use the workspace setting" onPress={() => set('permission', 'workspace')} />} />
        ) : null}
        {two && codex.value !== 'workspace' ? (
          <Row stack label="This project has its own Codex permissions" reading={codex} desc={CODEX_MODES[codex.value as keyof typeof CODEX_MODES]?.what ?? ''}
            control={<Button title="Use the workspace setting" onPress={() => set('codexMode', 'workspace')} />} />
        ) : null}
      </Group>
      <Group label="Archive">
        <Row first label="Archive this project"
          desc={`It leaves your inbox, the sidebar and Projects, and no new agents start on it${p.running ? '; the ones running now finish' : ''}. Its files stay where they are, and you can bring it back from Projects on your computer.`}
          control={<Button title="Archive" onPress={() => { set('archived', true); router.back(); }} />} />
      </Group>
    </Page>
  );
}
