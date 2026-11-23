// COMMENTS ON A FILE GO TO AN AGENT, AND YOU SEE AND CHOOSE WHOSE THEY ARE.
//
// What broke, seen 2026-11-21 in the demo team: Priya asked Jamie to approve
// the words on the sign-up screens. Jamie commented on the file twice, then
// pressed "Carry on with an agent". The agent's first message carried the task
// and the file and not one of the comments, so the agent never heard "nah".
// The founder: "how do I have my agents do these? ... will it send everyone's
// comments or just mine, or maybe I can choose that?" Measured by reading
// what taskHandOff opened the card on: no field held a comment.
//
// 2026-11-22: a picker of ticks and face chips answered "can I choose", and the
// founder found it confusing: "multiplayer should just be super minimalist".
// The comments are now lines of the message itself, each saying who wrote it,
// and choosing is deleting a line, as in any message.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { commentsToHand, commentsForTheAgent, withComments, handedIn } from '../renderer/src/threads/comments-to-hand';

const ME = 'jamie';
const note = (id: string, extra: Record<string, unknown>) => ({
  id, file: 'attachments/sign-up-screens.md', place: { kind: 'whole' }, text: 'x', by: ME, ts: 1, mentions: [], owner: null, uid: null, ...extra,
});
const notes = [
  note('n1', { place: { kind: 'quote', text: 'Pick the Dropbox you are moving from.' }, text: 'nah', ts: 10 }),
  note('n2', { text: 'good stuff', ts: 20 }),
  note('n3', { by: 'priya', place: { kind: 'quote', text: 'Every folder arrives where you left it.' }, text: 'Say which folders.', ts: 15, replies: [{ id: 'r1', text: 'Agreed, name them.', by: ME, ts: 16 }] }),
  note('n4', { by: 'theo', text: 'Old and settled.', ts: 5, resolved: true }),
  note('n5', { file: 'attachments/launch-email.md', by: 'theo', text: 'Shorter subject.', ts: 30 }),
  note('n6', { by: null, place: { kind: 'pin', x: 0.2, y: 0.3 }, pin: 1, text: 'Mine, from before I signed in.', ts: 40 }),
];
const nameOf = (id: string | null) => ({ priya: 'Priya', theo: 'Theo' } as Record<string, string>)[id ?? ''] ?? 'Someone';

describe('which comments a hand-over offers', () => {
  it('every open comment on the thread, oldest first, and no resolved one', () => {
    expect(commentsToHand(notes, { me: ME }).map((c) => c.id)).toEqual(['n1', 'n3', 'n2', 'n5', 'n6']);
  });

  it('only one file\'s, when it comes from that file, a later version of it included', () => {
    const later = [...notes, note('n7', { file: 'attachments/sign-up-screens-v2.md', text: 'Better.', ts: 50 })];
    expect(commentsToHand(later, { me: ME, files: ['attachments/sign-up-screens.md'] }).map((c) => c.id)).toEqual(['n1', 'n3', 'n2', 'n6', 'n7']);
  });

  // Rerun 4: from a chat's file the hand-over named the file by its copy on disk,
  // mwsgbe7x-mdfg29-payment-failed-copy.md, which no comment was on, and the agent
  // asked for the comments to be pasted. A chat's comments name it as people do.
  it("a chat's file, named by its copy on disk, finds the comments made on it by name", () => {
    const chat = [note('c1', { file: 'payment-failed-copy.md', by: 'theo', text: 'Say what failed.', ts: 60 })];
    const stamp = Date.now().toString(36);
    expect(commentsToHand(chat, { me: ME, files: [`attachments/${stamp}-mdfg29-payment-failed-copy.md`] }).map((c) => c.id)).toEqual(['c1']);
    const view = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomFileView.tsx', import.meta.url), 'utf8');
    expect(view).toContain("const name = shownName(paths[0] ?? '');");
  });

  it('a comment on another file is not one of them', () => {
    expect(commentsToHand(notes, { me: ME, files: ['attachments/launch-email.md'] }).map((c) => c.id)).toEqual(['n5']);
  });

  it('says which are yours, a comment with no author included', () => {
    const mine = commentsToHand(notes, { me: ME }).filter((c) => c.mine).map((c) => c.id);
    expect(mine).toEqual(['n1', 'n2', 'n6']);
  });

  it('keeps the file name a person sees and the place as words', () => {
    const [first] = commentsToHand(notes, { me: ME });
    expect(first).toMatchObject({ name: 'sign-up-screens.md', place: 'Pick the Dropbox you are moving from.', quote: true });
    expect(commentsToHand(notes, { me: ME }).find((c) => c.id === 'n2')?.place).toBe(null);
    expect(commentsToHand(notes, { me: ME }).find((c) => c.id === 'n6')?.place).toBe('Pin 1');
  });
});

describe('what the agent is told', () => {
  const all = commentsToHand(notes, { me: ME });
  const words = commentsForTheAgent(all, { nameOf });

  it('each comment with its place and who wrote it, grouped by file', () => {
    expect(words).toContain('Comments on sign-up-screens.md:');
    expect(words).toContain('- On “Pick the Dropbox you are moving from.”: nah (me)');
    expect(words).toContain('- On the whole file: good stuff (me)');
    expect(words).toContain('- On “Every folder arrives where you left it.”: Say which folders. (Priya)');
    expect(words).toContain('  - Agreed, name them. (me)');
    expect(words).toContain('Comments on launch-email.md:');
    expect(words).toContain('- On Pin 1: Mine, from before I signed in. (me)');
  });

  it('asks for the changes as the next version of each file', () => {
    expect(words).toContain('sign-up-screens-v2.md');
    expect(words).toContain('launch-email-v2.md');
  });

  // Rerun: Lena asked for clinic-checkout-mobile-review.html above the comments,
  // and the line under them told the agent to save clinic-checkout-v3.html.
  it('yields to a name the person gave anywhere in the message', () => {
    expect(words).toContain('Save the result as sign-up-screens-v2.md beside sign-up-screens.md unless the message names another file');
  });

  it('nothing, when none are chosen', () => {
    expect(commentsForTheAgent([], { nameOf })).toBe('');
  });

  it('the card opens on the words, then every comment as a line of the message', () => {
    const body = withComments('Approve the words on the sign-up screens', all, { nameOf });
    expect(body.startsWith('Approve the words on the sign-up screens\n\nComments on sign-up-screens.md:')).toBe(true);
    expect(body).toContain('nah (me)');
    expect(body).toContain('Say which folders. (Priya)');
    expect(withComments('Just the task', [], { nameOf })).toBe('Just the task');
  });

  it('a line deleted before Send is a comment the agent was not given', () => {
    const body = withComments('Approve the words', all, { nameOf });
    const without = body.split('\n').filter((l) => !l.includes('Say which folders')).join('\n');
    expect(handedIn(body, all, { nameOf })).toEqual(['n1', 'n3', 'n2', 'n5', 'n6']);
    expect(handedIn(without, all, { nameOf })).toEqual(['n1', 'n2', 'n5', 'n6']);
    expect(handedIn('Just do it', all, { nameOf })).toEqual([]);
  });
});

describe('every way to an agent carries them', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const card = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
  it('the hand-over opens the card with the thread\'s comments', () => {
    expect(app.match(/commentsToHand\(notes, /g)?.length).toBe(3);
    // Round two: a hand-over left out comments made on another copy of the same
    // file, which the notes panel showed. Both read the same list now.
    expect(app).toContain('const comments = notesOnThread(item);');
    const notes = fs.readFileSync(new URL('../renderer/src/threads/thread-notes.ts', import.meta.url), 'utf8');
    expect(notes).toMatch(/withElsewhere\(own, await api\.fileElsewhere/);
    expect(app).toContain("'zero:hand-comments'");
  });
  // Round one of the testers (2026-11-21): reviewing a teammate's thread, three
  // of four looked beside Approve for Hand to an agent and found only Send to.
  it("a teammate's thread hands its comments on too, from its notes and from Continue it yourself", () => {
    const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/onHandToAgent=\{onContinue \? \(files\) => \{[^}]*commentsToHand\(marks\.notes, \{ me: team\?\.me \?\? null, files \}\)/);
    expect(page).toMatch(/onContinue\(commentsToHand\(marks\.notes, \{ me: team\?\.me \?\? null \}\)\)/);
    expect(app).toMatch(/continueTeammateThread = useCallback\(\(card: ThreadCard, comments: HandedComment\[\] = \[\], files\?: string\[\]\)/);
    // Rerun 3: from one file's notes the card carried every version of the file.
    expect(app).toContain('attachments: ofTheFile.slice(-1)');
  });
  it("a file's notes hand over its newest version by path, so the card can attach it", () => {
    const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');
    expect(view).toContain('onHandToAgent!([family!.versions.at(-1)!.path])');
    // Seen in the running app: the card opened behind the full-page file, and a
    // newest version kept in another thread came as an absolute path no link matched.
    const big = fs.readFileSync(new URL('../renderer/src/components/ThreadArtifacts.tsx', import.meta.url), 'utf8');
    expect(big).toMatch(/onHandToAgent=\{withAgent \? undefined : \(files\) => \{ onClose\(\);/);
    expect(app).toMatch(/srcPath: f\.startsWith\('\/'\) \|\| !dir \? f : `\$\{dir\}\/\$\{f\}`/);
  });
  // Rerun 3 (2026-11-22): a designer opened Theo's comment on a file in their chat
  // from Needs you and found Approve and Send to Theo, nothing for her own agent.
  it("a chat's file and a file in Files hand their comments on too, the card opening at its top", () => {
    const chat = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomFileView.tsx', import.meta.url), 'utf8');
    const place = fs.readFileSync(new URL('../renderer/src/files/FilesPlace.tsx', import.meta.url), 'utf8');
    expect(chat).toMatch(/onHandToAgent=\{handToAgent\}/);
    expect(chat).toContain("'zero:hand-file-comments'");
    expect(place).toContain("'zero:hand-file-comments'");
    expect(app).toContain("window.addEventListener('zero:hand-file-comments', ask)");
    expect(app.match(/caret: \[0, 0\]/g)?.length).toBeGreaterThanOrEqual(4);
  });
  // Rerun 5: a designer sent a comment she meant to leave out, because it sat below
  // the six lines the box showed.
  it('the box is tall enough to show the comments it opens with', () => {
    const css = fs.readFileSync(new URL('../renderer/src/threads/thread-composer.css', import.meta.url), 'utf8');
    expect(card).toContain("comments.length && !person ? ' tc-text-tall' : ''");
    expect(css).toMatch(/\.tc-text\.tc-text-tall \{ height: min\(440px, 52vh\); \}/);
  });
  it('the card has no picker: the comments are in its words, and the ones left in are remembered', () => {
    expect(card).not.toContain('HandedComments');
    expect(fs.existsSync(new URL('../renderer/src/threads/HandedComments.tsx', import.meta.url))).toBe(false);
    expect(card).toMatch(/rememberHanded\(product\.slug, made\.id, handedIn\(/);
    expect(app.match(/body: withComments\(/g)?.length).toBe(4);
  });
});
