// One project's "How it runs", as the desktop's project page has it.
import { Redirect, useLocalSearchParams } from 'expo-router';
import { CODEX_MODES } from '../../../../../renderer/src/codex-modes';
import { MODE_SENTENCE, RULES_ALWAYS_APPLY } from '../../../../../renderer/src/modes';
import { useSettings } from '../../../state/settings';
import { Button, Choice, Group, Page, Row, Switch } from '../../../ui/SettingsParts';

export default function ProjectSettings() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const s = useSettings();
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
  const two = (w?.engines ?? []).length > 1;
  const accounts: { id: string; email: string | null }[] = w?.accounts ?? [];
  return (
    <Page title={p.name} back="Projects">
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
    </Page>
  );
}
