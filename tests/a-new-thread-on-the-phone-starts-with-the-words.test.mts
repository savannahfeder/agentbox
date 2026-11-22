// A NEW THREAD ON THE PHONE STARTS WITH THE WORDS (2026-11-22). The New thread
// page was a form: four ruled rows (To, Model, Project, Priority) above the
// message, Send a grey word in the top bar, and "Attach a file or picture"
// spelled out along the foot over a hairline. Part of "a redesign of
// everything". Measured by reading app/new.tsx and ui/NewThreadForm.tsx.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const form = fs.readFileSync('mobile/src/ui/NewThreadForm.tsx', 'utf8');
const page = fs.readFileSync('mobile/src/app/new.tsx', 'utf8');
const fn = (name: string) => form.slice(form.indexOf(`export function ${name}(`), form.indexOf('\n}\n', form.indexOf(`export function ${name}(`)));
const fields = fn('NewThreadFields');
const foot = fn('NewThreadFoot');
const send = fn('SendButtons');

describe('the New thread page', () => {
  it('opens on the message, large, before any choice', () => {
    expect(fields.indexOf('<TextInput')).toBeGreaterThan(-1);
    expect(fields.indexOf('<TextInput')).toBeLessThan(fields.indexOf('said={`To: '));
    expect(fields).toMatch(/fontSize: inline \? 16\.5 : 19/);
  });
  it('offers who, model, project and priority as chips under the words, not ruled rows', () => {
    for (const said of ['To: ', 'Model: ', 'Priority: ']) expect(fields).toContain(`said={\`${said}`);
    expect(fields).toMatch(/'Works in' : 'Project'\}: \$\{projectName \|\| 'Pick a project'\}/);
    expect(form).not.toMatch(/function Field\(/);
    expect(fields).not.toMatch(/borderBottomWidth/);
  });
  it('still asks a teammate for no model and no priority, and someone new for where they work', () => {
    expect(fields).toMatch(/\{!mate && <ChoiceButton said=\{`Model: /);
    expect(fields).toMatch(/\{!mate && <ChoiceButton said=\{`Priority: /);
    expect(fields).toMatch(/mate === 'new' \? 'Works in' : 'Project'/);
  });
  it('sends from the round key at the foot, beside attach and the microphone, with no line over them', () => {
    expect(page).toMatch(/<NewThreadFoot form=\{form\} foot=\{footRoom\(inset\)\} send=\{<SendButtons form=\{form\} \/>\} \/>/);
    expect(page).not.toMatch(/right=\{/);
    expect(foot).not.toMatch(/borderTopWidth/);
    expect(foot).toMatch(/accessibilityLabel="Attach a file or picture"/);
    expect(foot).toMatch(/<MicButton talk=\{talk\} \/>/);
  });
});

describe('Send on a new thread', () => {
  it('is the round filled key, and says Sending while it goes', () => {
    expect(send).toMatch(/<SendKey disabled=\{!canSend\} busy=\{busy\} onPress=\{\(\) => \(talk\.on \? talk\.send\(\) : void send\(\)\)\} \/>/);
  });
  it('keeps Send later beside it, but not for a message to a teammate', () => {
    expect(send).toMatch(/\{!form\.mate && \(/);
    expect(send).toMatch(/accessibilityLabel="Send later"/);
  });
});

describe('the empty inbox\'s box', () => {
  it('is the same card the reply box is', () => {
    expect(fn('InboxComposer')).toMatch(/borderRadius: 26, backgroundColor: color\.card, borderWidth: 1, borderColor: color\.line, \.\.\.lift\('card'\)/);
  });
});
